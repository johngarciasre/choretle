import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb } from "@/db/drizzle";
import { signInAndGetFamily, addFamilyMember } from "./fixtures";

async function createSlate(harness: TestHarness, name = "Rotation Slate"): Promise<string> {
  const res = await harness.invokeHandler("/api/slates", "POST", { name });
  expect(res.status).toBe(201);
  return res.body.id;
}

describe("Rotations API Integration", () => {
  beforeEach(() => {
    resetDb();
  });

  it("POST /api/rotations creates a rotation for a family slate and member", async () => {
    const harness = new TestHarness();
    const { familyId, userId } = await signInAndGetFamily(harness);
    const slateId = await createSlate(harness);
    const childId = addFamilyMember(familyId);

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
    await signInAndGetFamily(harness);

    const res = await harness.invokeHandler("/api/rotations", "POST", {});
    expect(res.status).toBe(400);
  });

  it("POST /api/rotations rejects a slate from another family", async () => {
    const other = new TestHarness();
    await signInAndGetFamily(other, "other@choretle.dev");
    const foreignSlate = await createSlate(other, "Foreign Slate");

    const harness = new TestHarness();
    const { userId } = await signInAndGetFamily(harness);

    const res = await harness.invokeHandler("/api/rotations", "POST", { slateId: foreignSlate, userId });
    expect(res.status).toBe(404);
  });

  it("POST /api/rotations rejects a user from another family", async () => {
    const harness = new TestHarness();
    const { userId: ownUserId } = await signInAndGetFamily(harness);
    const slateId = await createSlate(harness);

    const other = new TestHarness();
    const otherIdentity = await signInAndGetFamily(other, "other@choretle.dev");

    const res = await harness.invokeHandler("/api/rotations", "POST", { slateId, userId: otherIdentity.userId });
    expect(res.status).toBe(404);
    expect(ownUserId).toBeTruthy();
  });

  it("PUT /api/rotations updates an existing rotation", async () => {
    const harness = new TestHarness();
    const { familyId, userId } = await signInAndGetFamily(harness);
    const slateId = await createSlate(harness);
    const childId = addFamilyMember(familyId);
    const created = await harness.invokeHandler("/api/rotations", "POST", { slateId, userId });

    const res = await harness.invokeHandler("/api/rotations?familyId=x", "PUT", {
      id: created.body.id, slateId, userId: childId, intervalDays: 14,
    });
    expect(res.status).toBe(200);
    expect(res.body.user_id).toBe(childId);
    expect(res.body.interval_days).toBe(14);
  });

  it("DELETE /api/rotations/[rotationId] removes the rotation once", async () => {
    const harness = new TestHarness();
    const { userId } = await signInAndGetFamily(harness);
    const slateId = await createSlate(harness);
    const created = await harness.invokeHandler("/api/rotations", "POST", { slateId, userId });

    const first = await harness.invokeHandler("/api/rotations/[rotationId]", "DELETE", undefined, { rotationId: created.body.id });
    expect(first.status).toBe(200);

    const second = await harness.invokeHandler("/api/rotations/[rotationId]", "DELETE", undefined, { rotationId: created.body.id });
    expect(second.status).toBe(404);
  });
});
