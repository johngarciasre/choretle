import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb } from "@/db/drizzle";
import { signInAndGetFamily } from "./fixtures";

async function createSlate(harness: TestHarness, body: Record<string, unknown>) {
  const res = await harness.invokeHandler("/api/slates", "POST", body);
  expect(res.status).toBe(201);
  return res.body;
}

async function listSlates(harness: TestHarness): Promise<any[]> {
  const res = await harness.invokeHandler("/api/slates", "GET");
  expect(res.status).toBe(200);
  return res.body;
}

describe("Slates API", () => {
  beforeEach(() => {
    resetDb();
  });

  it("creates a slate with weekly defaults in the caller's family", async () => {
    const harness = new TestHarness();
    const { familyId } = await signInAndGetFamily(harness);

    const slate = await createSlate(harness, { name: "Weekly Chores" });

    expect(slate).toMatchObject({ name: "Weekly Chores", frequency: "weekly", interval: 1, family_id: familyId });
    expect(slate.is_active).toBe(1);
  });

  it("persists custom frequency, interval, description and room", async () => {
    const harness = new TestHarness();
    await signInAndGetFamily(harness);

    const slate = await createSlate(harness, {
      name: "Biweekly Bathroom",
      frequency: "biweekly",
      interval: 2,
      description: "Scrub the tiles",
      roomLocation: "Bathroom",
    });

    expect(slate).toMatchObject({
      frequency: "biweekly",
      interval: 2,
      description: "Scrub the tiles",
      room_location: "Bathroom",
    });
    const listed = await listSlates(harness);
    // The collection endpoint normalizes snake_case to camelCase.
    expect(listed[0]).toMatchObject({
      frequency: "biweekly",
      interval: 2,
      description: "Scrub the tiles",
      roomLocation: "Bathroom",
    });
  });

  it("rejects a missing name", async () => {
    const harness = new TestHarness();
    await signInAndGetFamily(harness);

    const res = await harness.invokeHandler("/api/slates", "POST", {});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/);
  });

  it("lists only this family's slates", async () => {
    const mine = new TestHarness();
    await signInAndGetFamily(mine);
    await createSlate(mine, { name: "Mine" });

    const other = new TestHarness();
    await signInAndGetFamily(other, "other@choretle.dev");
    await createSlate(other, { name: "Theirs" });

    expect((await listSlates(mine)).map((s) => s.name)).toEqual(["Mine"]);
    expect((await listSlates(other)).map((s) => s.name)).toEqual(["Theirs"]);
  });

  it("deletes a slate and stops listing it", async () => {
    const harness = new TestHarness();
    await signInAndGetFamily(harness);
    const slate = await createSlate(harness, { name: "Disposable" });

    const res = await harness.invokeHandler("/api/slates/[slateId]", "DELETE", undefined, { slateId: slate.id });

    expect(res.status).toBe(200);
    expect(await listSlates(harness)).toHaveLength(0);
  });

  it("cannot read another family's slate by id", async () => {
    const mine = new TestHarness();
    await signInAndGetFamily(mine);

    const other = new TestHarness();
    await signInAndGetFamily(other, "other@choretle.dev");
    const foreign = await createSlate(other, { name: "Theirs" });

    const res = await mine.invokeHandler("/api/slates/[slateId]", "GET", undefined, { slateId: foreign.id });
    expect(res.status).toBe(404);
  });
});
