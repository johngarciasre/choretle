import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb, getDb } from "@/db";
import { signInAndGetHousehold, addHouseholdMember, addUserWithoutHousehold } from "./fixtures";

describe("Families API", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns the caller's household and its members", async () => {
    const harness = new TestHarness();
    const { householdId, userId } = await signInAndGetHousehold(harness);
    const childId = await addHouseholdMember(householdId);

    const res = await harness.invokeHandler(`/api/household?id=${householdId}`, "GET");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.household.id).toBe(householdId);
    expect(res.body.users.map((u: any) => u.id).sort()).toEqual([userId, childId].sort());
  });

  it("does not expose another household", async () => {
    const mine = new TestHarness();
    await signInAndGetHousehold(mine);

    const other = new TestHarness();
    const otherIdentity = await signInAndGetHousehold(other, "other@choretle.dev");

    const res = await mine.invokeHandler(`/api/household?id=${otherIdentity.householdId}`, "GET");
    expect(res.status).toBe(403);
  });

  it("requires a name and a session to create a household", async () => {
    const anonymous = new TestHarness();
    const noSession = await anonymous.invokeHandler("/api/household", "POST", { name: "Nobody" });
    expect(noSession.status).toBe(401);

    const harness = new TestHarness();
    await signInAndGetHousehold(harness);
    const noName = await harness.invokeHandler("/api/household", "POST", {});
    expect(noName.status).toBe(400);
  });

  it("refuses a second household for an existing member", async () => {
    const harness = new TestHarness();
    const { householdId } = await signInAndGetHousehold(harness);

    const res = await harness.invokeHandler("/api/household", "POST", { name: "Second Household" });

    expect(res.status).toBe(409);
    const me = await harness.invokeHandler("/api/auth/me", "GET");
    expect(me.body.householdId).toBe(householdId);
  });

  it("creates a household for an account without one, with a slug from the name", async () => {
    await addUserWithoutHousehold("no-household-user", "lonely@choretle.dev");
    const harness = new TestHarness();
    const signIn = await harness.invokeHandler("/api/auth/signin", "POST", { email: "lonely@choretle.dev", password: "test" });
    expect(signIn.status).toBe(200);

    const res = await harness.invokeHandler("/api/household", "POST", { name: "The Garcias" });

    expect(res.status).toBe(200);
    expect(res.body.household).toMatchObject({ name: "The Garcias", slug: "the-garcias" });
    expect(res.body.household.id).toBeTruthy();
    const row = await getDb()!.prepare(`SELECT household_id FROM memberships WHERE user_id = ?`).get("no-household-user") as any;
    expect(row.household_id).toBe(res.body.household.id);
  });
});
