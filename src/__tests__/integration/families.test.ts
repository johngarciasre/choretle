import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb, getRawDb } from "@/db/drizzle";
import { signInAndGetFamily, addFamilyMember, addUserWithoutFamily } from "./fixtures";

describe("Families API", () => {
  beforeEach(() => {
    resetDb();
  });

  it("returns the caller's family and its members", async () => {
    const harness = new TestHarness();
    const { familyId, userId } = await signInAndGetFamily(harness);
    const childId = addFamilyMember(familyId);

    const res = await harness.invokeHandler(`/api/family?id=${familyId}`, "GET");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.family.id).toBe(familyId);
    expect(res.body.users.map((u: any) => u.id).sort()).toEqual([userId, childId].sort());
  });

  it("does not expose another family", async () => {
    const mine = new TestHarness();
    await signInAndGetFamily(mine);

    const other = new TestHarness();
    const otherIdentity = await signInAndGetFamily(other, "other@choretle.dev");

    const res = await mine.invokeHandler(`/api/family?id=${otherIdentity.familyId}`, "GET");
    expect(res.status).toBe(403);
  });

  it("requires a name and a session to create a family", async () => {
    const anonymous = new TestHarness();
    const noSession = await anonymous.invokeHandler("/api/family", "POST", { name: "Nobody" });
    expect(noSession.status).toBe(401);

    const harness = new TestHarness();
    await signInAndGetFamily(harness);
    const noName = await harness.invokeHandler("/api/family", "POST", {});
    expect(noName.status).toBe(400);
  });

  it("refuses a second family for an existing member", async () => {
    const harness = new TestHarness();
    const { familyId } = await signInAndGetFamily(harness);

    const res = await harness.invokeHandler("/api/family", "POST", { name: "Second Household" });

    expect(res.status).toBe(409);
    const me = await harness.invokeHandler("/api/auth/me", "GET");
    expect(me.body.familyId).toBe(familyId);
  });

  it("creates a family for an account without one, with a slug from the name", async () => {
    addUserWithoutFamily("no-family-user", "lonely@choretle.dev");
    const harness = new TestHarness();
    const signIn = await harness.invokeHandler("/api/auth/signin", "POST", { email: "lonely@choretle.dev", password: "test" });
    expect(signIn.status).toBe(200);

    const res = await harness.invokeHandler("/api/family", "POST", { name: "The Garcias" });

    expect(res.status).toBe(200);
    expect(res.body.family).toMatchObject({ name: "The Garcias", slug: "the-garcias" });
    expect(res.body.family.id).toBeTruthy();
    const row = getRawDb()!.prepare(`SELECT family_id FROM users WHERE id = ?`).get("no-family-user") as any;
    expect(row.family_id).toBe(res.body.family.id);
  });
});
