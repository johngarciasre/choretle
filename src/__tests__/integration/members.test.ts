import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb, getRawDb } from "@/db/drizzle";
import { signInAndGetFamily, addFamilyMember, addUserWithoutFamily } from "./fixtures";

function dbUser(id: string): any {
  return getRawDb()!.prepare(`SELECT id, role, family_id FROM users WHERE id = ?`).get(id);
}

function memberIds(harness: TestHarness) {
  return harness.invokeHandler("/api/users", "GET").then((res) => (res.body.users || []).map((u: any) => u.id));
}

describe("Family members API", () => {
  beforeEach(() => {
    resetDb();
  });

  it("lists the family in the shape the family page reads", async () => {
    const harness = new TestHarness();
    const { familyId, userId } = await signInAndGetFamily(harness);
    const childId = addFamilyMember(familyId);

    const res = await harness.invokeHandler("/api/users", "GET");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.map((u: any) => u.id).sort()).toEqual([userId, childId].sort());
    const child = res.body.users.find((u: any) => u.id === childId);
    expect(child).toMatchObject({ role: "child", familyId, pointsTotal: 0, avatarUrl: null });
  });

  it("a parent can toggle a member's role", async () => {
    const harness = new TestHarness();
    const { familyId } = await signInAndGetFamily(harness);
    const childId = addFamilyMember(familyId);

    const res = await harness.invokeHandler("/api/users", "PUT", { userId: childId, role: "parent" });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("parent");
    expect(dbUser(childId).role).toBe("parent");
  });

  it("a child cannot change roles", async () => {
    const harness = new TestHarness();
    const { familyId, userId: parentId } = await signInAndGetFamily(harness);
    const childId = addFamilyMember(familyId);

    const child = new TestHarness();
    const signIn = await child.invokeHandler("/api/auth/signin", "POST", { email: `${childId}@choretle.dev`, password: "test" });
    expect(signIn.status).toBe(200);

    const res = await child.invokeHandler("/api/users", "PUT", { userId: parentId, role: "child" });
    expect(res.status).toBe(403);
    expect(dbUser(parentId).role).toBe("parent");
  });

  it("refuses to demote the last parent", async () => {
    const harness = new TestHarness();
    const { userId } = await signInAndGetFamily(harness);

    const res = await harness.invokeHandler("/api/users", "PUT", { userId, role: "child" });

    expect(res.status).toBe(400);
    expect(dbUser(userId).role).toBe("parent");

    // With a second parent, demotion is allowed.
    const second = addFamilyMember((await harness.invokeHandler("/api/auth/me", "GET")).body.familyId, "parent");
    const allowed = await harness.invokeHandler("/api/users", "PUT", { userId: second, role: "child" });
    expect(allowed.status).toBe(200);
  });

  it("does not touch members of another family", async () => {
    const mine = new TestHarness();
    await signInAndGetFamily(mine);

    const other = new TestHarness();
    const otherIdentity = await signInAndGetFamily(other, "other@choretle.dev");

    const res = await mine.invokeHandler("/api/users", "PUT", { userId: otherIdentity.userId, role: "child" });
    expect(res.status).toBe(404);
    expect(dbUser(otherIdentity.userId).role).toBe("parent");
  });

  it("a parent can remove a member, but not themselves", async () => {
    const harness = new TestHarness();
    const { familyId, userId } = await signInAndGetFamily(harness);
    const childId = addFamilyMember(familyId);

    const self = await harness.invokeHandler("/api/users", "DELETE", { userId });
    expect(self.status).toBe(400);

    const removed = await harness.invokeHandler("/api/users", "DELETE", { userId: childId });
    expect(removed.status).toBe(200);
    expect(dbUser(childId).family_id).toBeNull();
    expect(await memberIds(harness)).toEqual([userId]);
  });
});

describe("Family rename", () => {
  beforeEach(() => {
    resetDb();
  });

  it("persists the new name through PUT", async () => {
    const harness = new TestHarness();
    const { familyId } = await signInAndGetFamily(harness);

    const res = await harness.invokeHandler("/api/family/[familyId]", "PUT", { name: "The Garcias" }, { familyId });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("The Garcias");
    const row = getRawDb()!.prepare(`SELECT name FROM families WHERE id = ?`).get(familyId) as any;
    expect(row.name).toBe("The Garcias");
  });
});

describe("Joining a family by code", () => {
  beforeEach(() => {
    resetDb();
  });

  it("attaches a user with no family and adopts the invite's role", async () => {
    const parent = new TestHarness();
    const { familyId } = await signInAndGetFamily(parent);
    const code = (await parent.invokeHandler("/api/family/join/generate-code", "POST", {})).body.invite.code;

    // An account that exists but has no family yet.
    addUserWithoutFamily("joiner", "joiner@choretle.dev");
    const joiner = new TestHarness();
    const signIn = await joiner.invokeHandler("/api/auth/signin", "POST", { email: "joiner@choretle.dev", password: "test" });
    expect(signIn.status).toBe(200);

    const joined = await joiner.invokeHandler("/api/family/join", "POST", { code });

    expect(joined.status).toBe(200);
    expect(joined.body.family).toEqual({ id: familyId, name: expect.any(String) });
    expect(dbUser("joiner").family_id).toBe(familyId);
    expect(dbUser("joiner").role).toBe("child");

    // The code is single use.
    addUserWithoutFamily("late", "late@choretle.dev");
    const late = new TestHarness();
    await late.invokeHandler("/api/auth/signin", "POST", { email: "late@choretle.dev", password: "test" });
    const reuse = await late.invokeHandler("/api/family/join", "POST", { code });
    expect(reuse.status).toBe(400);
    expect(dbUser("late").family_id).toBeNull();
  });
});

describe("Family swap meet entries", () => {
  beforeEach(() => {
    resetDb();
  });

  it("returns only this family's sharing and requesting entries", async () => {
    const harness = new TestHarness();
    const { familyId } = await signInAndGetFamily(harness);
    const other = new TestHarness();
    const otherIdentity = await signInAndGetFamily(other, "other@choretle.dev");

    const rawDb = getRawDb()!;
    const now = new Date().toISOString();
    const insert = rawDb.prepare(
      `INSERT INTO swap_meet (id, slate_id, sharing_family_id, requesting_family_id, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`
    );
    insert.run("sm-out", "slate-a", familyId, otherIdentity.familyId, now);
    insert.run("sm-in", "slate-b", otherIdentity.familyId, familyId, now);
    insert.run("sm-theirs", "slate-c", otherIdentity.familyId, "family-someone-else", now);

    const res = await harness.invokeHandler("/api/family/swap-meet", "GET");

    expect(res.status).toBe(200);
    expect(res.body.swaps.map((s: any) => s.id).sort()).toEqual(["sm-in", "sm-out"]);
    expect(res.body.swaps.find((s: any) => s.id === "sm-out")).toMatchObject({
      slateId: "slate-a",
      sharingFamilyId: familyId,
      requestedBy: otherIdentity.familyId,
      status: "pending",
    });
  });

  it("requires authentication", async () => {
    const res = await new TestHarness().invokeHandler("/api/family/swap-meet", "GET");
    expect(res.status).toBe(401);
  });
});
