import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb, getDb } from "@/db";
import { signInAndGetHousehold, createListFixture } from "./fixtures";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("E2E — Full Workflow: tasks → slate → rotation → generated jobs → points", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("generates a job from a slate, assigns it, completes it and scores it once", async () => {
    const harness = new TestHarness();
    const { userId } = await signInAndGetHousehold(harness, "parent@choretle.dev");

    // A task worth 7 points
    const taskRes = await harness.invokeHandler("/api/tasks", "POST", { name: "Wash dishes", points: 7 });
    expect(taskRes.status).toBe(200);
    const taskId = taskRes.body.id;

    // A slate holding that task
    const slateRes = await harness.invokeHandler("/api/slates", "POST", { name: "Kitchen", frequency: "daily" });
    expect(slateRes.status).toBe(201);
    const slateId = slateRes.body.id;

    const setTasks = await harness.invokeHandler("/api/slates/[slateId]/tasks", "PUT", { explicitTaskIds: [taskId] }, { slateId });
    expect(setTasks.status).toBe(200);

    // Rotate the slate to the parent so generated jobs are assigned
    const rotation = await harness.invokeHandler("/api/rotations", "POST", { slateId, userId });
    expect(rotation.status).toBe(201);

    // Generate today's list
    const generated = await harness.invokeHandler("/api/schedules/generate", "POST", { date: today() });
    expect(generated.status).toBe(200);
    expect(generated.body.count).toBe(1);

    const job = generated.body.jobs[0];
    expect(job.points).toBe(7);
    expect(job.assignedTo).toBe(userId);

    // The job must point at a real slate_tasks row, not at the task id
    const slateTask = await getDb()!.prepare(`SELECT id, task_id FROM slate_tasks WHERE id = ?`).get(job.slateTaskId) as any;
    expect(slateTask).toBeTruthy();
    expect(slateTask.task_id).toBe(taskId);

    // Complete it: todo -> doing -> done
    await harness.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "doing" }, { jobId: job.id });
    const done = await harness.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "done" }, { jobId: job.id });
    expect(done.status).toBe(200);

    const points = await getDb()!.prepare(`SELECT points_total FROM memberships WHERE user_id = ?`).get(userId) as any;
    expect(points.points_total).toBe(7);

    // Reports: the done job is counted on the completion date, and per-task stats are non-zero
    const report = await harness.invokeHandler("/api/reports?type=task_completion", "GET");
    expect(report.status).toBe(200);
    const stats = report.body.stats.find((s: any) => s.taskId === taskId);
    expect(stats.totalJobs).toBe(1);
    expect(stats.completedJobs).toBe(1);
    expect(report.body.jobs).toHaveLength(1);

    // Generation is idempotent for the same day
    const again = await harness.invokeHandler("/api/schedules/generate", "POST", { date: today() });
    expect(again.status).toBe(200);
    expect(again.body.count).toBe(0);
  });

  it("keeps two households' generated jobs apart", async () => {
    const first = new TestHarness();
    const firstIdentity = await signInAndGetHousehold(first, "first@choretle.dev");

    const second = new TestHarness();
    const secondIdentity = await signInAndGetHousehold(second, "second@choretle.dev");

    expect(firstIdentity.householdId).not.toBe(secondIdentity.householdId);

    const job = await first.invokeHandler("/api/jobs", "POST", {
      listId: await createListFixture(firstIdentity.householdId),
      name: "First household job",
      points: 3,
    });
    expect(job.status).toBe(200);

    // The second household cannot read or complete it
    const read = await second.invokeHandler("/api/jobs/[jobId]", "GET", undefined, { jobId: job.body.id });
    expect(read.status).toBe(403);

    const complete = await second.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "doing" }, { jobId: job.body.id });
    expect(complete.status).toBe(403);
  });
});
