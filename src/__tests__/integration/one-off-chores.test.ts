import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb, getRawDb } from "@/db/drizzle";
import { signInAndGetFamily, signInAsChild } from "./fixtures";

function pointsOf(userId: string): number {
  const row = getRawDb()!.prepare(`SELECT points_total FROM users WHERE id = ?`).get(userId) as any;
  return row?.points_total ?? 0;
}

function jobRow(jobId: string): any {
  return getRawDb()!.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId);
}

describe("One-off chores and the grab pool", () => {
  beforeEach(() => {
    resetDb();
  });

  it("creates a one-off chore in one family list shared by later one-offs", async () => {
    const harness = new TestHarness();
    const { familyId } = await signInAndGetFamily(harness);

    const first = await harness.invokeHandler("/api/jobs", "POST", { name: "Mow the lawn", points: 15 });
    expect(first.status).toBe(200);
    expect(first.body.name).toBe("Mow the lawn");
    expect(first.body.points).toBe(15);
    expect(first.body.list_id).toBeTruthy();

    const second = await harness.invokeHandler("/api/jobs", "POST", { name: "Clean the car", points: 20 });
    expect(second.status).toBe(200);
    expect(second.body.list_id).toBe(first.body.list_id);

    const lists = getRawDb()!.prepare(`SELECT * FROM lists WHERE family_id = ?`).all(familyId);
    expect(lists).toHaveLength(1);
  });

  it("stores the due date and the chosen assignee", async () => {
    const harness = new TestHarness();
    const { familyId, userId } = await signInAndGetFamily(harness);

    const res = await harness.invokeHandler("/api/jobs", "POST", {
      name: "Wash the dishes", points: 5, assignedTo: userId, dueDate: "2026-11-30",
    });

    expect(res.status).toBe(200);
    expect(res.body.assigned_to).toBe(userId);
    expect(String(res.body.due_date)).toContain("2026-11-30");

    // the hidden list still belongs to this family only
    const list = getRawDb()!.prepare(`SELECT family_id FROM lists WHERE id = ?`).get(res.body.list_id) as any;
    expect(list.family_id).toBe(familyId);
  });

  it("rejects an assignee who is not in the family", async () => {
    const other = new TestHarness();
    const otherIdentity = await signInAndGetFamily(other, "other@choretle.dev");

    const harness = new TestHarness();
    await signInAndGetFamily(harness);

    const res = await harness.invokeHandler("/api/jobs", "POST", {
      name: "Sneaky chore", assignedTo: otherIdentity.userId,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/assignedTo/);
  });

  it("refuses one-off chores from children", async () => {
    const parent = new TestHarness();
    const { familyId } = await signInAndGetFamily(parent);
    const { harness: child } = await signInAsChild(familyId);

    const res = await child.invokeHandler("/api/jobs", "POST", { name: "Self-assigned bonus" });
    expect(res.status).toBe(403);
  });

  it("puts an unassigned chore in the grab pool and lets exactly one child claim it", async () => {
    const parent = new TestHarness();
    const { familyId } = await signInAndGetFamily(parent);
    const created = await parent.invokeHandler("/api/jobs", "POST", { name: "Wash the dog", points: 12 });
    expect(created.status).toBe(200);

    const { harness: alice, childId: aliceId } = await signInAsChild(familyId);
    const { harness: bob } = await signInAsChild(familyId);

    const pool = await alice.invokeHandler("/api/jobs/kanban", "GET");
    expect(pool.body.available.map((j: any) => j.id)).toContain(created.body.id);

    const claim = await alice.invokeHandler("/api/jobs/[jobId]", "PUT", { claim: true }, { jobId: created.body.id });
    expect(claim.status).toBe(200);
    expect(claim.body.job.assignedTo).toBe(aliceId);

    const attempted = await bob.invokeHandler("/api/jobs/[jobId]", "PUT", { claim: true }, { jobId: created.body.id });
    expect(attempted.status).toBe(409);
    expect(jobRow(created.body.id).assigned_to).toBe(aliceId);

    const board = await alice.invokeHandler("/api/jobs/kanban", "GET");
    expect(board.body.jobs.map((j: any) => j.id)).toContain(created.body.id);
    expect(board.body.available.map((j: any) => j.id)).not.toContain(created.body.id);
  });

  it("pays the claimer only after the grabbed chore is completed", async () => {
    const parent = new TestHarness();
    const { familyId } = await signInAndGetFamily(parent);
    const created = await parent.invokeHandler("/api/jobs", "POST", { name: "Rake leaves", points: 9 });

    const { harness: child, childId } = await signInAsChild(familyId);
    await child.invokeHandler("/api/jobs/[jobId]", "PUT", { claim: true }, { jobId: created.body.id });
    expect(pointsOf(childId)).toBe(0);

    await child.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "doing" }, { jobId: created.body.id });
    const done = await child.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "done" }, { jobId: created.body.id });
    expect(done.status).toBe(200);
    expect(pointsOf(childId)).toBe(9);
  });

  it("will not let another family claim the chore", async () => {
    const parent = new TestHarness();
    await signInAndGetFamily(parent);
    const created = await parent.invokeHandler("/api/jobs", "POST", { name: "Family-only chore" });

    const otherParent = new TestHarness();
    const otherIdentity = await signInAndGetFamily(otherParent, "other@choretle.dev");
    const { harness: outsider } = await signInAsChild(otherIdentity.familyId);

    const res = await outsider.invokeHandler("/api/jobs/[jobId]", "PUT", { claim: true }, { jobId: created.body.id });
    expect(res.status).toBe(403);
    expect(jobRow(created.body.id).assigned_to).toBeNull();
  });

  it("does not offer a chore already assigned to someone", async () => {
    const parent = new TestHarness();
    const { familyId, userId } = await signInAndGetFamily(parent);
    await parent.invokeHandler("/api/jobs", "POST", { name: "Already owned", assignedTo: userId });

    const { harness: child } = await signInAsChild(familyId);
    const board = await child.invokeHandler("/api/jobs/kanban", "GET");
    expect(board.body.available.map((j: any) => j.name)).not.toContain("Already owned");
  });
});
