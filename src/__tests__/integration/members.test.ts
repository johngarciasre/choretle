import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb, getDb } from "@/db";
import { signInAndGetHousehold, addHouseholdMember, addUserWithoutHousehold } from "./fixtures";

async function dbUser(id: string): Promise<any> {
  return await getDb()!.prepare(`SELECT user_id, role, household_id FROM memberships WHERE user_id = ?`).get(id);
}

function memberIds(harness: TestHarness) {
  return harness.invokeHandler("/api/users", "GET").then((res) => (res.body.users || []).map((u: any) => u.id));
}

describe("Household members API", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("lists the household in the shape the household page reads", async () => {
    const harness = new TestHarness();
    const { householdId, userId } = await signInAndGetHousehold(harness);
    const childId = await addHouseholdMember(householdId);

    const res = await harness.invokeHandler("/api/users", "GET");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.map((u: any) => u.id).sort()).toEqual([userId, childId].sort());
    const child = res.body.users.find((u: any) => u.id === childId);
    expect(child).toMatchObject({ role: "child", householdId, pointsTotal: 0, avatarUrl: null });
  });

  it("a parent can toggle a member's role", async () => {
    const harness = new TestHarness();
    const { householdId } = await signInAndGetHousehold(harness);
    const childId = await addHouseholdMember(householdId);

    const res = await harness.invokeHandler("/api/users", "PUT", { userId: childId, role: "parent" });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("parent");
    expect((await dbUser(childId)).role).toBe("parent");
  });

  it("a child cannot change roles", async () => {
    const harness = new TestHarness();
    const { householdId, userId: parentId } = await signInAndGetHousehold(harness);
    const childId = await addHouseholdMember(householdId);

    const child = new TestHarness();
    const signIn = await child.invokeHandler("/api/auth/signin", "POST", { email: `${childId}@choretle.dev`, password: "test" });
    expect(signIn.status).toBe(200);

    const res = await child.invokeHandler("/api/users", "PUT", { userId: parentId, role: "child" });
    expect(res.status).toBe(403);
    expect((await dbUser(parentId)).role).toBe("parent");
  });

  it("refuses to demote the last parent", async () => {
    const harness = new TestHarness();
    const { userId } = await signInAndGetHousehold(harness);

    const res = await harness.invokeHandler("/api/users", "PUT", { userId, role: "child" });

    expect(res.status).toBe(400);
    expect((await dbUser(userId)).role).toBe("parent");

    // With a second parent, demotion is allowed.
    const second = await addHouseholdMember((await harness.invokeHandler("/api/auth/me", "GET")).body.householdId, "parent");
    const allowed = await harness.invokeHandler("/api/users", "PUT", { userId: second, role: "child" });
    expect(allowed.status).toBe(200);
  });

  it("does not touch members of another household", async () => {
    const mine = new TestHarness();
    await signInAndGetHousehold(mine);

    const other = new TestHarness();
    const otherIdentity = await signInAndGetHousehold(other, "other@choretle.dev");

    const res = await mine.invokeHandler("/api/users", "PUT", { userId: otherIdentity.userId, role: "child" });
    expect(res.status).toBe(404);
    expect((await dbUser(otherIdentity.userId)).role).toBe("parent");
  });

  it("a parent can remove a member, but not themselves", async () => {
    const harness = new TestHarness();
    const { householdId, userId } = await signInAndGetHousehold(harness);
    const childId = await addHouseholdMember(householdId);

    const self = await harness.invokeHandler("/api/users", "DELETE", { userId });
    expect(self.status).toBe(400);

    const removed = await harness.invokeHandler("/api/users", "DELETE", { userId: childId });
    expect(removed.status).toBe(200);
    expect(await dbUser(childId)).toBeUndefined();
    expect(await memberIds(harness)).toEqual([userId]);
  });
});

describe("Household rename", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("persists the new name through PUT", async () => {
    const harness = new TestHarness();
    const { householdId } = await signInAndGetHousehold(harness);

    const res = await harness.invokeHandler("/api/household/[householdId]", "PUT", { name: "The Garcias" }, { householdId });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("The Garcias");
    const row = await getDb()!.prepare(`SELECT name FROM households WHERE id = ?`).get(householdId) as any;
    expect(row.name).toBe("The Garcias");
  });
});

describe("Joining a household by code", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("attaches a user with no household and adopts the invite's role", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);
    const code = (await parent.invokeHandler("/api/household/join/generate-code", "POST", {})).body.invite.code;

    // An account that exists but has no household yet.
    await addUserWithoutHousehold("joiner", "joiner@choretle.dev");
    const joiner = new TestHarness();
    const signIn = await joiner.invokeHandler("/api/auth/signin", "POST", { email: "joiner@choretle.dev", password: "test" });
    expect(signIn.status).toBe(200);

    const joined = await joiner.invokeHandler("/api/household/join", "POST", { code });

    expect(joined.status).toBe(200);
    expect(joined.body.household).toEqual({ id: householdId, name: expect.any(String) });
    expect((await dbUser("joiner")).household_id).toBe(householdId);
    expect((await dbUser("joiner")).role).toBe("child");

    // The code is single use.
    await addUserWithoutHousehold("late", "late@choretle.dev");
    const late = new TestHarness();
    await late.invokeHandler("/api/auth/signin", "POST", { email: "late@choretle.dev", password: "test" });
    const reuse = await late.invokeHandler("/api/household/join", "POST", { code });
    expect(reuse.status).toBe(400);
    expect(await dbUser("late")).toBeUndefined();
  });
});

describe("Household swap meet entries", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns only this household's sharing and requesting entries", async () => {
    const harness = new TestHarness();
    const { householdId } = await signInAndGetHousehold(harness);
    const other = new TestHarness();
    const otherIdentity = await signInAndGetHousehold(other, "other@choretle.dev");

    const rawDb = getDb()!;
    const now = new Date().toISOString();
    const insert = await rawDb.prepare(
      `INSERT INTO swap_meet (id, slate_id, sharing_household_id, requesting_household_id, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`
    );
    insert.run("sm-out", "slate-a", householdId, otherIdentity.householdId, now);
    insert.run("sm-in", "slate-b", otherIdentity.householdId, householdId, now);
    insert.run("sm-theirs", "slate-c", otherIdentity.householdId, "household-someone-else", now);

    const res = await harness.invokeHandler("/api/household/swap-meet", "GET");

    expect(res.status).toBe(200);
    expect(res.body.swaps.map((s: any) => s.id).sort()).toEqual(["sm-in", "sm-out"]);
    expect(res.body.swaps.find((s: any) => s.id === "sm-out")).toMatchObject({
      slateId: "slate-a",
      sharingHouseholdId: householdId,
      requestedBy: otherIdentity.householdId,
      status: "pending",
    });
  });

  it("requires authentication", async () => {
    const res = await new TestHarness().invokeHandler("/api/household/swap-meet", "GET");
    expect(res.status).toBe(401);
  });
});
