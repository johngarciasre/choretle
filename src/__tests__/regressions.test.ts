import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { TestHarness } from "./integration/harness";
import { signInAndGetFamily, createListFixture, addFamilyMember } from "./integration/fixtures";
import { resetDb, getRawDb, resolveDbPath } from "@/db/drizzle";
import { verifyAuth } from "@/lib/auth";
import { getDevUserFromRequest } from "@/lib/dev-auth";
import { middleware } from "../../middleware";

/** A request the way Next hands it to a route after middleware forwarding. */
function headerRequest(userId: string, familyId = ""): NextRequest {
  return new NextRequest("http://localhost:3000/api/tasks", {
    headers: { "x-user-id": userId, "x-family-id": familyId },
  });
}

async function hmac(json: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(json));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("audit regressions", () => {
  beforeEach(() => {
    resetDb();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves the family from the database when middleware only forwarded x-user-id", async () => {
    const harness = new TestHarness();
    const { userId, familyId } = await signInAndGetFamily(harness);

    const auth = await verifyAuth(headerRequest(userId));
    expect(auth).toEqual({ userId, familyId, role: "parent" });
  });

  it("does not trust a dev cookie outside dev mode", async () => {
    vi.stubEnv("AUTH_MODE", "production");
    const forged = new Request("http://localhost:3000/api/tasks", {
      headers: { cookie: 'dev-session={"user":{"id":"dev-user-x","email":"x@x","name":"x","role":"parent","familyId":"family-1"}}' },
    });
    expect(await getDevUserFromRequest(forged)).toBeNull();
  });

  it("rejects a dev cookie whose signature has been tampered with", async () => {
    const harness = new TestHarness();
    await harness.signIn("tamper@choretle.dev");
    const original = harness.getCookieJar().get("dev-session")!;
    // Flip the last character to a *different* value: overwriting it with a
    // fixed one left the cookie valid whenever the signature already ended in
    // that character, making this test flaky.
    const last = original.slice(-1);
    harness.getCookieJar().set("dev-session", `${original.slice(0, -1)}${last === "0" ? "1" : "0"}`);

    const me = await harness.invokeHandler("/api/auth/me", "GET");
    expect(me.body.authenticated).toBe(false);
  });

  it("serves the dashboard for a child without a SQL error", async () => {
    const parent = new TestHarness();
    const { familyId } = await signInAndGetFamily(parent, "parent@choretle.dev");
    const childId = addFamilyMember(familyId);
    const childRow = getRawDb()!.prepare(`SELECT email FROM users WHERE id = ?`).get(childId) as any;

    const child = new TestHarness();
    await child.signIn(childRow.email);
    const res = await child.invokeHandler("/api/dashboard", "GET");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.kid.pendingVerification)).toBe(true);
    expect(res.body.kid.stats.points_total).toBe(0);
  });

  it("persists a swap meet share with its requesting family and message columns", async () => {
    const a = new TestHarness();
    const aId = await signInAndGetFamily(a, "a@choretle.dev");
    const b = new TestHarness();
    const bId = await signInAndGetFamily(b, "b@choretle.dev");

    const slate = await a.invokeHandler("/api/slates", "POST", { name: "Shareable" });
    const res = await a.invokeHandler("/api/swap-meet", "POST", {
      sharingFamilyId: aId.familyId,
      requestingFamilyId: bId.familyId,
      slateIds: [slate.body.id],
      messages: { [slate.body.id]: "try this" },
    });

    expect(res.status).toBe(200);
    const row = getRawDb()!.prepare(`SELECT * FROM swap_meet WHERE id = ?`).get(res.body.entries[0].id) as any;
    expect(row.requesting_family_id).toBe(bId.familyId);
    expect(row.message).toBe("try this");

    // Cannot share someone else's slate
    const stolen = await a.invokeHandler("/api/swap-meet", "POST", {
      sharingFamilyId: bId.familyId,
      requestingFamilyId: aId.familyId,
      slateIds: [slate.body.id],
    });
    expect(stolen.status).toBe(403);
  });

  it("edits subtasks and renames teams (no missing updated_at column)", async () => {
    const harness = new TestHarness();
    await signInAndGetFamily(harness);

    const task = await harness.invokeHandler("/api/tasks", "POST", { name: "Tidy", points: 2 });
    const subtask = await harness.invokeHandler("/api/tasks/subtasks", "POST", { taskId: task.body.id, name: "Step 1", points: 1 });
    expect(subtask.status).toBe(201);

    const edited = await harness.invokeHandler("/api/tasks/subtasks", "PUT", { subtaskId: subtask.body.id, name: "Step one" });
    expect(edited.status).toBe(200);
    expect(edited.body.name).toBe("Step one");

    const team = await harness.invokeHandler("/api/teams", "POST", { name: "Team A" });
    const renamed = await harness.invokeHandler("/api/teams", "PUT", { id: team.body.id, name: "Team B" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("Team B");
  });

  it("filters the done report by completion date, not list start date", async () => {
    const harness = new TestHarness();
    const { familyId, userId } = await signInAndGetFamily(harness);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const listId = createListFixture(familyId, tenDaysAgo);

    const job = await harness.invokeHandler("/api/jobs", "POST", { listId, name: "Old list job", points: 4, assignedTo: userId });
    await harness.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "done" }, { jobId: job.body.id });

    const done = await harness.invokeHandler("/api/reports?type=done&days=1", "GET");
    expect(done.status).toBe(200);
    expect(done.body.jobs.map((j: any) => j.id)).toContain(job.body.id);
  });

  it("ranks the leaderboard medal by points within the family", async () => {
    const parent = new TestHarness();
    const { familyId, userId: parentId } = await signInAndGetFamily(parent, "parent@choretle.dev");
    const childId = addFamilyMember(familyId);
    const childRow = getRawDb()!.prepare(`SELECT email FROM users WHERE id = ?`).get(childId) as any;

    getRawDb()!.prepare(`UPDATE users SET points_total = 100 WHERE id = ?`).run(parentId);
    getRawDb()!.prepare(`UPDATE users SET points_total = 50 WHERE id = ?`).run(childId);

    const child = new TestHarness();
    await child.signIn(childRow.email);
    const res = await child.invokeHandler("/api/medals", "GET");
    const leaderboard = res.body.medals.find((m: any) => m.type === "leaderboard");

    // Second place is worth gold (1st diamond, 2nd gold, 3rd silver)
    expect(leaderboard.level).toBe("gold");
  });

  it("keeps a real database path outside tests and creates the swap_meet columns", () => {
    expect(resolveDbPath()).toBe(":memory:");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SQLITE_PATH", "/tmp/choretle-test.db");
    expect(resolveDbPath()).toBe("/tmp/choretle-test.db");
    vi.stubEnv("SQLITE_PATH", "");
    vi.stubEnv("SQLITE_DB", "");
    expect(resolveDbPath()).toBe("./data/choretle.db");

    const columns = getRawDb()!.prepare(`PRAGMA table_info(swap_meet)`).all() as any[];
    const names = columns.map((c) => c.name);
    expect(names).toContain("requesting_family_id");
    expect(names).toContain("message");
  });

  it("does not fall back to a public websudo secret", async () => {
    vi.stubEnv("AUTH_MODE", "production");
    vi.stubEnv("WEBSUDO_SECRET", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    // Cookie signed with the old hard-coded default must not elevate anyone.
    const payload = JSON.stringify({ userId: "dev-user-x", email: "x@x", name: "x", exp: Date.now() + 60000 });
    const cookie = `${payload}.${await hmac(payload, "dev-websudo-secret-change-me")}`;
    const request = new NextRequest("http://localhost:3000/dashboard", {
      headers: { cookie: `webserversudo-session=${cookie}` },
    });

    const response = await middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/auth/signin");
  });

  it("returns 401 (not 500) for a superadmin password of the wrong length", async () => {
    vi.stubEnv("SUPERADMIN_USERNAME", "root");
    vi.stubEnv("SUPERADMIN_PASSWORD", "correct-horse-battery");

    const harness = new TestHarness();
    const res = await harness.invokeHandler("/api/auth/superadmin", "POST", { username: "root", password: "short" });
    expect(res.status).toBe(401);
  });

  it("refuses to generate jobs without a session", async () => {
    const anonymous = new TestHarness();
    const res = await anonymous.invokeHandler("/api/schedules/generate", "POST", { familyId: "family-any" });
    expect(res.status).toBe(401);
  });

  it("does not let one family edit another family's task", async () => {
    const a = new TestHarness();
    await signInAndGetFamily(a, "a@choretle.dev");
    const task = await a.invokeHandler("/api/tasks", "POST", { name: "A's chore", points: 5 });
    expect(task.status).toBe(200);

    const b = new TestHarness();
    await signInAndGetFamily(b, "b@choretle.dev");

    const viaCollection = await b.invokeHandler("/api/tasks", "PUT", { id: task.body.id, name: "Hijacked" });
    expect(viaCollection.status).toBe(404);

    const viaDetail = await b.invokeHandler("/api/tasks/[taskId]", "PUT", { name: "Hijacked" }, { taskId: task.body.id });
    expect(viaDetail.status).toBe(404);

    // The owner still sees the original name
    const check = await a.invokeHandler("/api/tasks/[taskId]", "GET", undefined, { taskId: task.body.id });
    expect(check.body.name).toBe("A's chore");
  });
});
