import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb, getDb } from "@/db";
import { signInAndGetHousehold, signInAsChild } from "./fixtures";

async function createTag(harness: TestHarness, name: string, color = "#ff0000") {
  const res = await harness.invokeHandler("/api/tags", "POST", { name, color });
  expect(res.status).toBe(201);
  return res.body;
}

async function listTags(harness: TestHarness): Promise<any[]> {
  const res = await harness.invokeHandler("/api/tags", "GET");
  expect(res.status).toBe(200);
  return res.body;
}

describe("Tags API", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("creates a tag in the caller's household", async () => {
    const harness = new TestHarness();
    const { householdId } = await signInAndGetHousehold(harness);

    const tag = await createTag(harness, "Urgent");

    expect(tag).toMatchObject({ name: "Urgent", color: "#ff0000", household_id: householdId });
  });

  it("rejects a missing name", async () => {
    const harness = new TestHarness();
    await signInAndGetHousehold(harness);

    const res = await harness.invokeHandler("/api/tags", "POST", {});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name is required/);
  });

  it("rejects a duplicate name inside a household but allows it in another household", async () => {
    const mine = new TestHarness();
    await signInAndGetHousehold(mine);
    await createTag(mine, "Kitchen");

    const duplicate = await mine.invokeHandler("/api/tags", "POST", { name: "Kitchen" });
    expect(duplicate.status).toBe(409);
    expect(await listTags(mine)).toHaveLength(1);

    const other = new TestHarness();
    await signInAndGetHousehold(other, "other@choretle.dev");
    const elsewhere = await other.invokeHandler("/api/tags", "POST", { name: "Kitchen" });
    expect(elsewhere.status).toBe(201);
  });

  it("lists exactly this household's tags with task counts", async () => {
    const harness = new TestHarness();
    await signInAndGetHousehold(harness);
    const a = await createTag(harness, "Tag A");
    await createTag(harness, "Tag B", "#00ff00");

    const task = await harness.invokeHandler("/api/tasks", "POST", { name: "Tidy", points: 1 });
    expect(task.status).toBe(200);
    getDb()!
      .prepare(`INSERT INTO task_tags (id, tag_id, task_id) VALUES (?, ?, ?)`)
      .run(`tt-${crypto.randomUUID()}`, a.id, task.body.id);

    const tags = await listTags(harness);
    expect(tags.map((t) => t.name).sort()).toEqual(["Tag A", "Tag B"]);
    expect(tags.find((t) => t.id === a.id).taskCount).toBe(1);
    expect(tags.find((t) => t.name === "Tag B").taskCount).toBe(0);
  });

  it("updates a tag and persists the new values", async () => {
    const harness = new TestHarness();
    await signInAndGetHousehold(harness);
    const tag = await createTag(harness, "Old Name");

    const res = await harness.invokeHandler("/api/tags", "PUT", { id: tag.id, name: "New Name", color: "#0000ff" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: tag.id, name: "New Name", color: "#0000ff" });
    const listed = await listTags(harness);
    expect(listed[0]).toMatchObject({ id: tag.id, name: "New Name", color: "#0000ff" });
  });

  it("deletes a tag and its junction rows", async () => {
    const harness = new TestHarness();
    await signInAndGetHousehold(harness);
    const tag = await createTag(harness, "Delete Me");
    const task = await harness.invokeHandler("/api/tasks", "POST", { name: "Tidy", points: 1 });
    getDb()!
      .prepare(`INSERT INTO task_tags (id, tag_id, task_id) VALUES (?, ?, ?)`)
      .run(`tt-${crypto.randomUUID()}`, tag.id, task.body.id);

    const res = await harness.invokeHandler("/api/tags", "DELETE", { id: tag.id });

    expect(res.status).toBe(200);
    expect(await listTags(harness)).toHaveLength(0);
    const junctions = await getDb()!.prepare(`SELECT COUNT(*) as n FROM task_tags WHERE tag_id = ?`).get(tag.id) as any;
    expect(junctions.n).toBe(0);
  });

  it("children cannot create, update or delete tags but can read them", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);
    const tag = await createTag(parent, "Adults Only");
    const { harness: child } = await signInAsChild(householdId);

    const create = await child.invokeHandler("/api/tags", "POST", { name: "Kid Tag" });
    expect(create.status).toBe(403);

    const update = await child.invokeHandler("/api/tags", "PUT", { id: tag.id, name: "Renamed" });
    expect(update.status).toBe(403);

    const remove = await child.invokeHandler("/api/tags", "DELETE", { id: tag.id });
    expect(remove.status).toBe(403);

    const list = await child.invokeHandler("/api/tags", "GET");
    expect(list.status).toBe(200);
    expect(list.body.map((t: any) => t.name)).toEqual(["Adults Only"]);
  });

  it("cannot touch another household's tag", async () => {
    const mine = new TestHarness();
    await signInAndGetHousehold(mine);

    const other = new TestHarness();
    await signInAndGetHousehold(other, "other@choretle.dev");
    const foreign = await createTag(other, "Theirs");

    const update = await mine.invokeHandler("/api/tags", "PUT", { id: foreign.id, name: "Hijacked" });
    expect(update.status).toBe(404);

    const remove = await mine.invokeHandler("/api/tags", "DELETE", { id: foreign.id });
    expect(remove.status).toBe(404);

    expect((await listTags(other))[0].name).toBe("Theirs");
  });
});
