import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb, resetDb } from "@/db";
import { TestHarness } from "./harness";
import { addHouseholdMember, createListFixture, signInAndGetHousehold } from "./fixtures";
import { hashToken } from "@/lib/session";

async function givePicker(harness: TestHarness, householdId: string): Promise<void> {
  const token = `token-${randomUUID()}`;
  await getDb()
    .prepare(
      `insert into sessions (id, kind, household_id, mode, token_hash, created_at, last_seen_at, expires_at)
       values (?, 'picker', ?, 'own', ?, now(), now(), now() + interval '30 days')`,
    )
    .run(`sess-${randomUUID()}`, householdId, hashToken(token));
  harness.getCookieJar().set("cs-device", token);
}

describe("Household tenancy", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("keeps points on the membership, so one person can belong to two households", async () => {
    const parentA = new TestHarness();
    const { householdId: householdA } = await signInAndGetHousehold(parentA, "a@choretle.dev");
    const parentB = new TestHarness();
    const { householdId: householdB } = await signInAndGetHousehold(parentB, "b@choretle.dev");

    const sharedUserId = await addHouseholdMember(householdA, "child", "Sam Shared");
    await getDb()
      .prepare(`insert into memberships (id, household_id, user_id, role, points_total, joined_at) values (?, ?, ?, 'child', 0, now())`)
      .run(`mem-${randomUUID()}`, householdB, sharedUserId);

    await getDb()
      .prepare(`update memberships set points_total = 10 where user_id = ? and household_id = ?`)
      .run(sharedUserId, householdA);
    await getDb()
      .prepare(`update memberships set points_total = 50 where user_id = ? and household_id = ?`)
      .run(sharedUserId, householdB);

    const pickerA = new TestHarness();
    await givePicker(pickerA, householdA);
    const pickerB = new TestHarness();
    await givePicker(pickerB, householdB);

    const boardA = await pickerA.invokeHandler("/api/kiosk/leaderboard", "GET");
    const boardB = await pickerB.invokeHandler("/api/kiosk/leaderboard", "GET");
    expect(boardA.status).toBe(200);
    expect(boardB.status).toBe(200);

    const samA = boardA.body.members.find((member: any) => member.user.id === sharedUserId);
    const samB = boardB.body.members.find((member: any) => member.user.id === sharedUserId);
    expect(samA.points).toBe(10);
    expect(samB.points).toBe(50);
  });

  it("lets a helper approve a submitted chore from an adult session", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);
    const kidId = await addHouseholdMember(householdId, "child", "Review Kid");
    const helperId = await addHouseholdMember(householdId, "helper", "Alice Helper");

    const listId = await createListFixture(householdId);
    const job = await parent.invokeHandler("/api/jobs", "POST", {
      listId,
      name: "Sweep the porch",
      points: 5,
      assignedTo: kidId,
    });
    expect(job.status).toBe(200);
    await getDb().prepare(`update jobs set verify_required = 1 where id = ?`).run(job.body.id);
    await getDb().prepare(`update jobs set status = 'under_review' where id = ?`).run(job.body.id);

    const helperRow = (await getDb().prepare(`select email from users where id = ?`).get(helperId)) as {
      email: string;
    };
    const helper = new TestHarness();
    const signedIn = await helper.invokeHandler("/api/auth/signin", "POST", {
      email: helperRow.email,
      password: "test",
    });
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.role).toBe("helper");

    const approved = await helper.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "done" }, {
      jobId: job.body.id,
    });
    expect(approved.status).toBe(200);

    const points = (await getDb()
      .prepare(`select points_total from memberships where user_id = ? and household_id = ?`)
      .get(kidId, householdId)) as { points_total: number };
    expect(points.points_total).toBe(5);
  });

  it("does not let a helper author chores", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);
    const helperId = await addHouseholdMember(householdId, "helper", "Bob Helper");
    const row = (await getDb().prepare(`select email from users where id = ?`).get(helperId)) as { email: string };

    const helper = new TestHarness();
    await helper.invokeHandler("/api/auth/signin", "POST", { email: row.email, password: "test" });

    const res = await helper.invokeHandler("/api/tasks", "POST", { name: "Helper chore", points: 2 });
    expect(res.status).toBe(403);
  });

  it("gates a combined report on an active two-sided link", async () => {
    const parentA = new TestHarness();
    const { householdId: householdA } = await signInAndGetHousehold(parentA, "link-a@choretle.dev");
    const parentB = new TestHarness();
    const { householdId: householdB } = await signInAndGetHousehold(parentB, "link-b@choretle.dev");

    const requested = await parentA.invokeHandler("/api/household/links", "POST", { householdId: householdB });
    expect(requested.status).toBe(200);
    expect(requested.body.status).toBe("pending");

    const pendingReport = await parentA.invokeHandler("/api/reports?scope=linked", "GET");
    expect(pendingReport.status).toBe(403);

    const approved = await parentB.invokeHandler("/api/household/links/[linkId]", "POST", {}, {
      linkId: requested.body.id,
    });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("active");

    const linked = await parentA.invokeHandler("/api/reports?scope=linked", "GET");
    expect(linked.status).toBe(200);
    expect(linked.body.type).toBe("linked");
    expect(linked.body.households).toHaveLength(2);
    expect(linked.body.households.map((row: any) => row.householdId).sort()).toEqual(
      [householdA, householdB].sort(),
    );

    // Either side can pull the plug, and it takes effect immediately.
    const revoked = await parentB.invokeHandler("/api/household/links/[linkId]", "DELETE", undefined, {
      linkId: requested.body.id,
    });
    expect(revoked.status).toBe(200);
    expect((await parentA.invokeHandler("/api/reports?scope=linked", "GET")).status).toBe(403);
  });

  it("lets a person with two households choose which one they act in", async () => {
    const parentA = new TestHarness();
    const { householdId: householdA } = await signInAndGetHousehold(parentA, "switch-a@choretle.dev");
    const parentB = new TestHarness();
    const { householdId: householdB } = await signInAndGetHousehold(parentB, "switch-b@choretle.dev");

    const personId = await addHouseholdMember(householdA, "child", "Switcher");
    await getDb()
      .prepare(
        `insert into memberships (id, household_id, user_id, role, points_total, joined_at) values (?, ?, ?, 'parent', 0, now())`,
      )
      .run(`mem-${randomUUID()}`, householdB, personId);

    const row = (await getDb().prepare(`select email from users where id = ?`).get(personId)) as { email: string };
    const person = new TestHarness();
    await person.invokeHandler("/api/auth/signin", "POST", { email: row.email, password: "test" });

    const me = await person.invokeHandler("/api/auth/me", "GET");
    expect(me.body.householdId).toBe(householdA);
    expect(me.body.households).toHaveLength(2);
    expect(me.body.households.every((entry: any) => typeof entry.name === "string")).toBe(true);

    const switched = await person.invokeHandler("/api/auth/household", "POST", { householdId: householdB });
    expect(switched.status).toBe(200);
    expect(switched.body.role).toBe("parent");
    expect(switched.headers["set-cookie"] || "").toContain(`ch-household=${householdB}`);

    // middleware forwards the cookie as a header; verifyAuth re-checks membership.
    person.getCookieJar().set("x-household-id", householdB);
    const after = await person.invokeHandler("/api/auth/me", "GET");
    expect(after.body.householdId).toBe(householdB);

    // A household they do not belong to is refused, and naming it cannot widen access.
    const denied = await person.invokeHandler("/api/auth/household", "POST", { householdId: "household-nope" });
    expect(denied.status).toBe(403);

    person.getCookieJar().set("x-household-id", "household-nope");
    const fallback = await person.invokeHandler("/api/auth/me", "GET");
    expect(fallback.body.householdId).toBe(householdA);
  });

  it("never selects every column from users (pin_hash must not leak)", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "__tests__") continue;
          walk(full);
          continue;
        }
        if (!full.endsWith(".ts") && !full.endsWith(".tsx")) continue;
        const source = fs.readFileSync(full, "utf8");
        if (/select\s+\*\s+from\s+users/i.test(source)) offenders.push(full);
      }
    };
    walk(path.join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});
