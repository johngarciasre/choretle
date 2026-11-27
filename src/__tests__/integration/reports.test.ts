import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb, getDb } from "@/db";
import { signInAndGetHousehold, createListFixture, addHouseholdMember } from "./fixtures";

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
  const row = await getDb()!.prepare(`SELECT id FROM slate_tasks WHERE slate_id = ?`).get(slate.body.id) as any;
  return { taskId: task.body.id, slateTaskId: row.id };
}

/** A finished job whose completion time is pinned to `daysAgo`. */
async function seedDoneJob(
  harness: TestHarness,
  opts: { householdId: string; assignedTo: string; name: string; points: number; daysAgo: number; slateTaskId?: string },
): Promise<string> {
  const listId = await createListFixture(opts.householdId, new Date(Date.now() - opts.daysAgo * DAY));
  const created = await harness.invokeHandler("/api/jobs", "POST", {
    listId, name: opts.name, points: opts.points, assignedTo: opts.assignedTo, slateTaskId: opts.slateTaskId,
  });
  expect(created.status).toBe(200);
  const done = await harness.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "done" }, { jobId: created.body.id });
  expect(done.status).toBe(200);
  getDb()!
    .prepare(`UPDATE jobs SET completed_at = ? WHERE id = ?`)
    .run(new Date(Date.now() - opts.daysAgo * DAY).toISOString(), created.body.id);
  return created.body.id;
}

describe("Reports API", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rejects an unknown report type", async () => {
    const harness = new TestHarness();
    await signInAndGetHousehold(harness);

    const res = await harness.invokeHandler("/api/reports?type=nope", "GET");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown report type/);
  });

  it("daily defaults to today and echoes an explicit date", async () => {
    const harness = new TestHarness();
    await signInAndGetHousehold(harness);

    const todayRes = await harness.invokeHandler("/api/reports?type=daily", "GET");
    expect(todayRes.status).toBe(200);
    expect(todayRes.body).toMatchObject({ type: "daily", date: today() });

    const explicit = await harness.invokeHandler("/api/reports?type=daily&date=2026-01-15", "GET");
    expect(explicit.body.date).toBe("2026-01-15");
  });

  it("daily lists the jobs on that day's list and leaves older lists out", async () => {
    const harness = new TestHarness();
    const { householdId, userId } = await signInAndGetHousehold(harness);

    const todayList = await createListFixture(householdId);
    const todayJob = await harness.invokeHandler("/api/jobs", "POST", {
      listId: todayList, name: "Sweep", points: 2, assignedTo: userId,
    });
    expect(todayJob.status).toBe(200);

    const oldList = await createListFixture(householdId, new Date(Date.now() - 10 * DAY));
    const oldJob = await harness.invokeHandler("/api/jobs", "POST", {
      listId: oldList, name: "Mop", points: 3, assignedTo: userId,
    });
    expect(oldJob.status).toBe(200);

    const res = await harness.invokeHandler("/api/reports?type=daily", "GET");
    expect(res.status).toBe(200);
    const ids = res.body.jobs.map((j: any) => j.id);
    expect(ids).toContain(todayJob.body.id);
    expect(ids).not.toContain(oldJob.body.id);
  });

  it("daily includes one-off chores created that day", async () => {
    const harness = new TestHarness();
    const { userId } = await signInAndGetHousehold(harness);

    // No listId: one-off chores land on the household's hidden one-off list.
    const oneOff = await harness.invokeHandler("/api/jobs", "POST", { name: "Feed the dog", points: 1, assignedTo: userId });
    expect(oneOff.status).toBe(200);

    const res = await harness.invokeHandler("/api/reports?type=daily", "GET");
    expect(res.body.jobs.map((j: any) => j.id)).toContain(oneOff.body.id);
  });

  it("done includes completions inside the window and excludes older ones", async () => {
    const harness = new TestHarness();
    const { householdId, userId } = await signInAndGetHousehold(harness);
    const old = await seedDoneJob(harness, { householdId, assignedTo: userId, name: "Old", points: 3, daysAgo: 10 });

    const wide = await harness.invokeHandler("/api/reports?type=done&days=30", "GET");
    expect(wide.body.type).toBe("done");
    expect(wide.body.jobs.map((j: any) => j.id)).toContain(old);

    const narrow = await harness.invokeHandler("/api/reports?type=done&days=3", "GET");
    expect(narrow.body.jobs.map((j: any) => j.id)).not.toContain(old);
    expect(narrow.body.jobs).toHaveLength(0);
  });

  it("done does not leak another household's completions", async () => {
    const mine = new TestHarness();
    const myIdentity = await signInAndGetHousehold(mine);

    const other = new TestHarness();
    const otherIdentity = await signInAndGetHousehold(other, "other@choretle.dev");
    await seedDoneJob(other, { householdId: otherIdentity.householdId, assignedTo: otherIdentity.userId, name: "Theirs", points: 9, daysAgo: 0 });

    const res = await mine.invokeHandler("/api/reports?type=done&days=30", "GET");
    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(0);
    expect(myIdentity.householdId).toBeTruthy();
  });

  it("task_completion counts scheduled vs finished jobs and the completion rate", async () => {
    const harness = new TestHarness();
    const { householdId, userId } = await signInAndGetHousehold(harness);
    const { taskId, slateTaskId } = await seedTask(harness, "Dishes", 4);

    // Two jobs scheduled today from that task: one finished, one not.
    await seedDoneJob(harness, { householdId, assignedTo: userId, name: "Dishes", points: 4, daysAgo: 0, slateTaskId });
    const listId = await createListFixture(householdId);
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
    await signInAndGetHousehold(harness);

    const res = await harness.invokeHandler("/api/reports?type=task_completion&startDate=not-a-date", "GET");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid date range/);
  });

  it("member counts each member's jobs and points", async () => {
    const harness = new TestHarness();
    const { householdId, userId } = await signInAndGetHousehold(harness);
    const kidId = await addHouseholdMember(householdId);
    // Completing the job awards its 7 points to the assignee.
    await seedDoneJob(harness, { householdId, assignedTo: userId, name: "Bins", points: 7, daysAgo: 0 });

    const res = await harness.invokeHandler("/api/reports?type=member", "GET");

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("member");
    const me = res.body.stats.find((s: any) => s.userId === userId);
    expect(me).toMatchObject({ totalPoints: 7, totalJobs: 1, doneJobs: 1 });
    const kid = res.body.stats.find((s: any) => s.userId === kidId);
    expect(kid).toMatchObject({ totalPoints: 0, totalJobs: 0, doneJobs: 0 });
  });
});
