import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb, getRawDb } from "@/db/drizzle";
import { signInAndGetFamily, createListFixture, addFamilyMember } from "./fixtures";

const DAY = 24 * 60 * 60 * 1000;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A task wired to a slate so jobs can point at a real slate_tasks row. */
async function seedTask(harness: TestHarness, name: string, points = 5): Promise<{ taskId: string; slateTaskId: string }> {
  const task = await harness.invokeHandler("/api/tasks", "POST", { name, points });
  expect(task.status).toBe(200);
  const slate = await harness.invokeHandler("/api/slates", "POST", { name: `${name} slate` });
  expect(slate.status).toBe(201);
  const setTasks = await harness.invokeHandler(
    "/api/slates/[slateId]/tasks", "PUT", { explicitTaskIds: [task.body.id] }, { slateId: slate.body.id },
  );
  expect(setTasks.status).toBe(200);
  const row = getRawDb()!.prepare(`SELECT id FROM slate_tasks WHERE slate_id = ?`).get(slate.body.id) as any;
  return { taskId: task.body.id, slateTaskId: row.id };
}

/** A finished job whose completion time is pinned to `daysAgo`. */
async function seedDoneJob(
  harness: TestHarness,
  opts: { familyId: string; assignedTo: string; name: string; points: number; daysAgo: number; slateTaskId?: string },
): Promise<string> {
  const listId = createListFixture(opts.familyId, new Date(Date.now() - opts.daysAgo * DAY));
  const created = await harness.invokeHandler("/api/jobs", "POST", {
    listId, name: opts.name, points: opts.points, assignedTo: opts.assignedTo, slateTaskId: opts.slateTaskId,
  });
  expect(created.status).toBe(200);
  const done = await harness.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "done" }, { jobId: created.body.id });
  expect(done.status).toBe(200);
  getRawDb()!
    .prepare(`UPDATE jobs SET completed_at = ? WHERE id = ?`)
    .run(new Date(Date.now() - opts.daysAgo * DAY).toISOString(), created.body.id);
  return created.body.id;
}

describe("Reports API", () => {
  beforeEach(() => {
    resetDb();
  });

  it("rejects an unknown report type", async () => {
    const harness = new TestHarness();
    await signInAndGetFamily(harness);

    const res = await harness.invokeHandler("/api/reports?type=nope", "GET");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown report type/);
  });

  it("daily defaults to today and echoes an explicit date", async () => {
    const harness = new TestHarness();
    await signInAndGetFamily(harness);

    const todayRes = await harness.invokeHandler("/api/reports?type=daily", "GET");
    expect(todayRes.status).toBe(200);
    expect(todayRes.body).toMatchObject({ type: "daily", date: today() });

    const explicit = await harness.invokeHandler("/api/reports?type=daily&date=2026-01-15", "GET");
    expect(explicit.body.date).toBe("2026-01-15");
  });

  it("done includes completions inside the window and excludes older ones", async () => {
    const harness = new TestHarness();
    const { familyId, userId } = await signInAndGetFamily(harness);
    const old = await seedDoneJob(harness, { familyId, assignedTo: userId, name: "Old", points: 3, daysAgo: 10 });

    const wide = await harness.invokeHandler("/api/reports?type=done&days=30", "GET");
    expect(wide.body.type).toBe("done");
    expect(wide.body.jobs.map((j: any) => j.id)).toContain(old);

    const narrow = await harness.invokeHandler("/api/reports?type=done&days=3", "GET");
    expect(narrow.body.jobs.map((j: any) => j.id)).not.toContain(old);
    expect(narrow.body.jobs).toHaveLength(0);
  });

  it("done does not leak another family's completions", async () => {
    const mine = new TestHarness();
    const myIdentity = await signInAndGetFamily(mine);

    const other = new TestHarness();
    const otherIdentity = await signInAndGetFamily(other, "other@choretle.dev");
    await seedDoneJob(other, { familyId: otherIdentity.familyId, assignedTo: otherIdentity.userId, name: "Theirs", points: 9, daysAgo: 0 });

    const res = await mine.invokeHandler("/api/reports?type=done&days=30", "GET");
    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(0);
    expect(myIdentity.familyId).toBeTruthy();
  });

  it("task_completion counts scheduled vs finished jobs and the completion rate", async () => {
    const harness = new TestHarness();
    const { familyId, userId } = await signInAndGetFamily(harness);
    const { taskId, slateTaskId } = await seedTask(harness, "Dishes", 4);

    // Two jobs scheduled today from that task: one finished, one not.
    await seedDoneJob(harness, { familyId, assignedTo: userId, name: "Dishes", points: 4, daysAgo: 0, slateTaskId });
    const listId = createListFixture(familyId);
    const pending = await harness.invokeHandler("/api/jobs", "POST", {
      listId, name: "Dishes", points: 4, assignedTo: userId, slateTaskId,
    });
    expect(pending.status).toBe(200);

    const start = today();
    const res = await harness.invokeHandler(`/api/reports?type=task_completion&startDate=${start}&endDate=${start}`, "GET");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: "task_completion", startDate: start, endDate: start });
    expect(res.body.stats).toEqual([
      expect.objectContaining({ taskId, taskName: "Dishes", totalJobs: 2, completedJobs: 1, completionRate: 50 }),
    ]);
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.jobs[0]).toMatchObject({ name: "Dishes", assignedTo: expect.any(String), points: 4 });
  });

  it("task_completion rejects an invalid date range", async () => {
    const harness = new TestHarness();
    await signInAndGetFamily(harness);

    const res = await harness.invokeHandler("/api/reports?type=task_completion&startDate=not-a-date", "GET");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid date range/);
  });

  it("member counts each member's jobs and points", async () => {
    const harness = new TestHarness();
    const { familyId, userId } = await signInAndGetFamily(harness);
    const kidId = addFamilyMember(familyId);
    // Completing the job awards its 7 points to the assignee.
    await seedDoneJob(harness, { familyId, assignedTo: userId, name: "Bins", points: 7, daysAgo: 0 });

    const res = await harness.invokeHandler("/api/reports?type=member", "GET");

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("member");
    const me = res.body.stats.find((s: any) => s.userId === userId);
    expect(me).toMatchObject({ totalPoints: 7, totalJobs: 1, doneJobs: 1 });
    const kid = res.body.stats.find((s: any) => s.userId === kidId);
    expect(kid).toMatchObject({ totalPoints: 0, totalJobs: 0, doneJobs: 0 });
  });
});
