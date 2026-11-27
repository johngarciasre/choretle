import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb } from "@/db";
import { signInAndGetHousehold, addHouseholdMember } from "./fixtures";

async function createSlate(harness: TestHarness, name = "Rotation Slate"): Promise<string> {
  const res = await harness.invokeHandler("/api/slates", "POST", { name });
  expect(res.status).toBe(201);
  return res.body.id;
}

describe("Rotations API Integration", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("POST /api/rotations creates a rotation for a household slate and member", async () => {
    const harness = new TestHarness();
    const { householdId, userId } = await signInAndGetHousehold(harness);
    const slateId = await createSlate(harness);
    const childId = await addHouseholdMember(householdId);

    const res = await harness.invokeHandler("/api/rotations", "POST", { slateId, userId: childId });
    expect(res.status).toBe(201);
    expect(res.body.slate_id).toBe(slateId);
    expect(res.body.user_id).toBe(childId);

    // and the parent themselves is a valid assignee
    const own = await harness.invokeHandler("/api/rotations", "POST", { slateId, userId, order: 1 });
    expect(own.status).toBe(201);
  });

  it("POST /api/rotations returns 400 when slateId or userId is missing", async () => {
    const harness = new TestHarness();
    await signInAndGetHousehold(harness);

    const res = await harness.invokeHandler("/api/rotations", "POST", {});
    expect(res.status).toBe(400);
  });

  it("POST /api/rotations rejects a slate from another household", async () => {
    const other = new TestHarness();
    await signInAndGetHousehold(other, "other@choretle.dev");
    const foreignSlate = await createSlate(other, "Foreign Slate");

    const harness = new TestHarness();
    const { userId } = await signInAndGetHousehold(harness);

    const res = await harness.invokeHandler("/api/rotations", "POST", { slateId: foreignSlate, userId });
    expect(res.status).toBe(404);
  });

  it("POST /api/rotations rejects a user from another household", async () => {
    const harness = new TestHarness();
    const { userId: ownUserId } = await signInAndGetHousehold(harness);
    const slateId = await createSlate(harness);

    const other = new TestHarness();
    const otherIdentity = await signInAndGetHousehold(other, "other@choretle.dev");

    const res = await harness.invokeHandler("/api/rotations", "POST", { slateId, userId: otherIdentity.userId });
    expect(res.status).toBe(404);
    expect(ownUserId).toBeTruthy();
  });

  it("PUT /api/rotations updates an existing rotation", async () => {
    const harness = new TestHarness();
    const { householdId, userId } = await signInAndGetHousehold(harness);
    const slateId = await createSlate(harness);
    const childId = await addHouseholdMember(householdId);
    const created = await harness.invokeHandler("/api/rotations", "POST", { slateId, userId });

    const res = await harness.invokeHandler("/api/rotations?householdId=x", "PUT", {
      id: created.body.id, slateId, userId: childId, intervalDays: 14,
    });
    expect(res.status).toBe(200);
    expect(res.body.user_id).toBe(childId);
    expect(res.body.interval_days).toBe(14);
  });

  it("GET /api/rotations returns assignments in the camelCase shape the board posts back", async () => {
    const harness = new TestHarness();
    const { userId } = await signInAndGetHousehold(harness);
    const slateId = await createSlate(harness);
    await harness.invokeHandler("/api/rotations", "POST", { slateId, userId, intervalDays: 14 });

    const res = await harness.invokeHandler("/api/rotations?householdId=x", "GET");
    expect(res.status).toBe(200);
    const assignment = res.body.slates.find((s: any) => s.id === slateId).assignments[0];
    expect(assignment).toMatchObject({ slateId, userId, intervalDays: 14, isActive: true });

    // Saving the board means posting those assignments straight back.
    const save = await harness.invokeHandler("/api/rotations", "POST", {
      id: assignment.id,
      slateId: assignment.slateId,
      userId: assignment.userId,
      order: 1,
      intervalDays: 3,
      isActive: assignment.isActive,
    });
    expect(save.status).toBe(200);

    const after = await harness.invokeHandler("/api/rotations?householdId=x", "GET");
    const reloaded = after.body.slates.find((s: any) => s.id === slateId).assignments;
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]).toMatchObject({ intervalDays: 3, order: 1 });
  });

  it("DELETE /api/rotations/[rotationId] removes the rotation once", async () => {
    const harness = new TestHarness();
    const { userId } = await signInAndGetHousehold(harness);
    const slateId = await createSlate(harness);
    const created = await harness.invokeHandler("/api/rotations", "POST", { slateId, userId });

    const first = await harness.invokeHandler("/api/rotations/[rotationId]", "DELETE", undefined, { rotationId: created.body.id });
    expect(first.status).toBe(200);

    const second = await harness.invokeHandler("/api/rotations/[rotationId]", "DELETE", undefined, { rotationId: created.body.id });
    expect(second.status).toBe(404);
  });
});
