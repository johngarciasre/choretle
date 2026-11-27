import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb, resetDb } from "@/db";
import { TestHarness } from "./harness";
import { addHouseholdMember, createListFixture, signInAndGetHousehold } from "./fixtures";
import { hashPin } from "@/lib/pin";
import { SHARED_IDLE_MS, hashToken } from "@/lib/session";

/** Insert a session row and hand the harness its cookie. */
async function giveSession(
  harness: TestHarness,
  options: {
    kind: "picker" | "kid" | "tablet_adult";
    householdId: string;
    membershipId?: string | null;
    mode?: "own" | "shared";
    expiresInMs?: number;
    lastSeenAgoMs?: number;
    revoked?: boolean;
  },
): Promise<string> {
  const token = `token-${randomUUID()}`;
  const now = Date.now();
  const createdAt = new Date(now - (options.lastSeenAgoMs ?? 0)).toISOString();
  const expiresAt = new Date(now + (options.expiresInMs ?? 60 * 60 * 1000)).toISOString();
  await getDb()
    .prepare(
      `insert into sessions (id, kind, membership_id, household_id, mode, token_hash, device_label,
                             created_at, last_seen_at, expires_at, revoked_at)
       values (?, ?, ?, ?, ?, ?, 'test', ?, ?, ?, ?)`,
    )
    .run(
      `sess-${randomUUID()}`,
      options.kind,
      options.membershipId ?? null,
      options.householdId,
      options.mode ?? "own",
      hashToken(token),
      createdAt,
      createdAt,
      expiresAt,
      options.revoked ? new Date().toISOString() : null,
    );

  harness.getCookieJar().set(options.kind === "picker" ? "cs-device" : options.kind === "tablet_adult" ? "cs-tablet" : "cs-kid", token);
  return token;
}

async function membershipIdOf(userId: string, householdId: string): Promise<string> {
  const row = (await getDb()
    .prepare(`select id from memberships where user_id = ? and household_id = ?`)
    .get(userId, householdId)) as { id: string };
  return row.id;
}

async function createKid(
  householdId: string,
  name: string,
  pin: string[],
): Promise<string> {
  const userId = await addHouseholdMember(householdId, "child", name);
  await getDb()
    .prepare(`update users set pin_hash = ?, email = null where id = ?`)
    .run(hashPin(pin), userId);
  return userId;
}

describe("Kid and picker sessions", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("keeps a picker tablet out of chores but lets it show the kiosk leaderboard", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);

    const picker = new TestHarness();
    await giveSession(picker, { kind: "picker", householdId });

    const chores = await picker.invokeHandler("/api/jobs", "GET");
    expect(chores.status).toBe(401);

    const leaderboard = await picker.invokeHandler("/api/kiosk/leaderboard", "GET");
    expect(leaderboard.status).toBe(200);
    expect(leaderboard.body.members).toEqual(expect.any(Array));
    expect(JSON.stringify(leaderboard.body.members)).not.toContain("@");
  });

  it("lets a picker read the wallboard but not reports", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);

    const picker = new TestHarness();
    await giveSession(picker, { kind: "picker", householdId });

    expect((await picker.invokeHandler("/api/kiosk/wallboard", "GET")).status).toBe(200);
    expect((await picker.invokeHandler("/api/reports?type=wallboard", "GET")).status).toBe(401);
  });

  it("returns 401 after five idle minutes on a shared tablet but keeps an own-device session", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);

    const sharedKid = await createKid(householdId, "Shared Kid", ["smile", "rocket", "star", "cat"]);
    const ownKid = await createKid(householdId, "Own Kid", ["dog", "moon", "pizza", "bike"]);

    const shared = new TestHarness();
    await giveSession(shared, {
      kind: "kid",
      householdId,
      membershipId: await membershipIdOf(sharedKid, householdId),
      mode: "shared",
      // Created six minutes ago with a five-minute idle window: expired.
      lastSeenAgoMs: 6 * 60 * 1000,
      expiresInMs: -(60 * 1000),
    });

    const own = new TestHarness();
    await giveSession(own, {
      kind: "kid",
      householdId,
      membershipId: await membershipIdOf(ownKid, householdId),
      mode: "own",
      lastSeenAgoMs: 6 * 60 * 1000,
      expiresInMs: 90 * 24 * 60 * 60 * 1000,
    });

    expect((await shared.invokeHandler("/api/jobs", "GET")).status).toBe(401);
    expect((await own.invokeHandler("/api/jobs", "GET")).status).toBe(200);
  });

  it("refreshes a shared session on an activity ping", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);
    const kidId = await createKid(householdId, "Ping Kid", ["smile", "rocket", "star", "cat"]);

    const kid = new TestHarness();
    await giveSession(kid, {
      kind: "kid",
      householdId,
      membershipId: await membershipIdOf(kidId, householdId),
      mode: "shared",
      expiresInMs: SHARED_IDLE_MS,
    });

    const touch = await kid.invokeHandler("/api/auth/touch", "POST", {});
    expect(touch.status).toBe(200);
    expect((await kid.invokeHandler("/api/jobs", "GET")).status).toBe(200);
  });

  it("rejects a revoked session on the next request", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);
    const kidId = await createKid(householdId, "Revoked Kid", ["smile", "rocket", "star", "cat"]);

    const kid = new TestHarness();
    const token = await giveSession(kid, {
      kind: "kid",
      householdId,
      membershipId: await membershipIdOf(kidId, householdId),
      mode: "own",
    });

    const db = getDb();
    const row = (await db.prepare(`select id from sessions where token_hash = ?`).get(hashToken(token))) as {
      id: string;
    };
    const revoked = await parent.invokeHandler("/api/household/devices/[deviceId]", "DELETE", undefined, {
      deviceId: row.id,
    });
    expect(revoked.status).toBe(200);

    expect((await kid.invokeHandler("/api/jobs", "GET")).status).toBe(401);
  });

  it("locks a profile after five wrong PINs, and a correct PIN does not unlock it", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);
    const kidId = await createKid(householdId, "Lockout Kid", ["smile", "rocket", "star", "cat"]);

    const picker = new TestHarness();
    await giveSession(picker, { kind: "picker", householdId });

    const wrong = ["dog", "moon", "pizza", "bike"];
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await picker.invokeHandler("/api/auth/kid", "POST", { userId: kidId, pin: wrong });
      expect(res.status).toBe(401);
    }

    const sixth = await picker.invokeHandler("/api/auth/kid", "POST", { userId: kidId, pin: wrong });
    expect(sixth.status).toBe(429);

    const correct = await picker.invokeHandler("/api/auth/kid", "POST", {
      userId: kidId,
      pin: ["smile", "rocket", "star", "cat"],
    });
    expect(correct.status).toBe(429);
  });

  it("signs a kid in with the right PIN and sets a hardened cookie", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);
    const kidId = await createKid(householdId, "Cookie Kid", ["smile", "rocket", "star", "cat"]);

    const picker = new TestHarness();
    await giveSession(picker, { kind: "picker", householdId });

    const res = await picker.invokeHandler("/api/auth/kid", "POST", {
      userId: kidId,
      pin: ["smile", "rocket", "star", "cat"],
    });
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("kid");
    expect(res.body.idleTimeoutSeconds).toBe(300);

    const cookie = res.headers["set-cookie"] || "";
    expect(cookie).toContain("cs-kid=");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie).toContain("Max-Age=14400");
  });

  it("allows only one use of an enrollment code", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);

    const minted = await parent.invokeHandler("/api/auth/enroll", "POST", {});
    expect(minted.status).toBe(200);
    const code = minted.body.code as string;
    expect(code.length).toBeGreaterThan(20);

    const tablet = new TestHarness();
    const first = await tablet.invokeHandler("/api/auth/enroll/consume", "POST", { code });
    expect(first.status).toBe(200);
    expect(first.body.kind).toBe("picker");

    const replay = await new TestHarness().invokeHandler("/api/auth/enroll/consume", "POST", { code });
    expect(replay.status).toBe(400);
  });

  it("refuses to mint an enrollment code from a kid session", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);
    const kidId = await addHouseholdMember(householdId, "child", "Sneaky Kid");

    const kid = new TestHarness();
    await giveSession(kid, {
      kind: "kid",
      householdId,
      membershipId: await membershipIdOf(kidId, householdId),
      mode: "own",
    });

    const res = await kid.invokeHandler("/api/auth/enroll", "POST", {});
    expect(res.status).toBe(403);
  });

  it("does not let one child read another child's job", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);

    const emma = await createKid(householdId, "Emma", ["smile", "rocket", "star", "cat"]);
    const greg = await createKid(householdId, "Greg", ["dog", "moon", "pizza", "bike"]);
    const listId = await createListFixture(householdId);

    const created = await parent.invokeHandler("/api/jobs", "POST", {
      listId,
      name: "Greg's chore",
      points: 5,
      assignedTo: greg,
    });
    expect(created.status).toBe(200);

    const emmaSession = new TestHarness();
    await giveSession(emmaSession, {
      kind: "kid",
      householdId,
      membershipId: await membershipIdOf(emma, householdId),
      mode: "own",
    });

    const res = await emmaSession.invokeHandler("/api/jobs/[jobId]", "GET", undefined, {
      jobId: created.body.id,
    });
    expect(res.status).toBe(404);
  });

  it("does not let one child move or complete another child's chore", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);
    const emma = await createKid(householdId, "Emma Ownerless", ["smile", "rocket", "star", "cat"]);
    const greg = await createKid(householdId, "Greg Owner", ["dog", "moon", "pizza", "bike"]);
    const listId = await createListFixture(householdId);

    const job = await parent.invokeHandler("/api/jobs", "POST", {
      listId,
      name: "Greg's job",
      points: 5,
      assignedTo: greg,
    });
    expect(job.status).toBe(200);

    const emmaSession = new TestHarness();
    await giveSession(emmaSession, {
      kind: "kid",
      householdId,
      membershipId: await membershipIdOf(emma, householdId),
      mode: "own",
    });

    const touched = await emmaSession.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "doing" }, {
      jobId: job.body.id,
    });
    expect(touched.status).toBe(404);

    const stole = await emmaSession.invokeHandler(
      "/api/jobs/[jobId]",
      "PUT",
      { status: "doing", assignedTo: emma },
      { jobId: job.body.id },
    );
    expect(stole.status).toBe(404);

    // Even the owner cannot hand a chore to someone else.
    const gregSession = new TestHarness();
    await giveSession(gregSession, {
      kind: "kid",
      householdId,
      membershipId: await membershipIdOf(greg, householdId),
      mode: "own",
    });
    const reassigned = await gregSession.invokeHandler(
      "/api/jobs/[jobId]",
      "PUT",
      { status: "doing", assignedTo: emma },
      { jobId: job.body.id },
    );
    expect(reassigned.status).toBe(403);

    // The open grab pool still works for a child.
    const open = await parent.invokeHandler("/api/jobs", "POST", { listId, name: "Open job", points: 2 });
    expect(open.status).toBe(200);
    const claimed = await emmaSession.invokeHandler(
      "/api/jobs/[jobId]",
      "PUT",
      { claim: true },
      { jobId: open.body.id },
    );
    expect(claimed.status).toBe(200);
  });

  it("hides adults email addresses from a PIN session", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);
    const kidId = await createKid(householdId, "Private Kid", ["smile", "rocket", "star", "cat"]);

    const kid = new TestHarness();
    await giveSession(kid, {
      kind: "kid",
      householdId,
      membershipId: await membershipIdOf(kidId, householdId),
      mode: "own",
    });

    const asKid = await kid.invokeHandler("/api/users", "GET");
    expect(asKid.status).toBe(200);
    expect(asKid.body.users.every((member: any) => member.email === null)).toBe(true);

    const household = await kid.invokeHandler("/api/household/[householdId]", "GET", undefined, {
      householdId,
    });
    expect(household.status).toBe(200);
    expect(household.body.users.every((member: any) => member.email === null)).toBe(true);

    const asParent = await parent.invokeHandler("/api/users", "GET");
    expect(asParent.status).toBe(200);
    expect(asParent.body.users.some((member: any) => typeof member.email === "string")).toBe(true);
  });

  it("never lets a PIN session author a task, even for a parent", async () => {
    const parent = new TestHarness();
    const { householdId, userId } = await signInAndGetHousehold(parent);

    const tabletAdult = new TestHarness();
    await giveSession(tabletAdult, {
      kind: "tablet_adult",
      householdId,
      membershipId: await membershipIdOf(userId, householdId),
      mode: "shared",
    });

    const res = await tabletAdult.invokeHandler("/api/tasks", "POST", { name: "Tablet chore", points: 3 });
    expect(res.status).toBe(403);
  });
});
