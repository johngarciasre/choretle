import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb, getRawDb } from "@/db/drizzle";
import { signInAndGetFamily, createListFixture } from "./fixtures";

function pointsOf(userId: string): number {
  const row = getRawDb()!.prepare(`SELECT points_total FROM users WHERE id = ?`).get(userId) as any;
  return row?.points_total ?? 0;
}

describe("Jobs API Integration", () => {
  beforeEach(() => {
    resetDb();
  });

  it("POST /api/jobs requires a name when no listId is given", async () => {
    const harness = new TestHarness();
    await signInAndGetFamily(harness);

    const res = await harness.invokeHandler("/api/jobs", "POST", {});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/);
  });

  it("POST /api/jobs rejects a list from another family", async () => {
    const other = new TestHarness();
    const otherIdentity = await signInAndGetFamily(other, "other@choretle.dev");
    const foreignList = createListFixture(otherIdentity.familyId);

    const harness = new TestHarness();
    await signInAndGetFamily(harness);

    const res = await harness.invokeHandler("/api/jobs", "POST", { listId: foreignList, name: "Sneaky" });
    expect(res.status).toBe(404);
  });

  it("POST /api/jobs creates a job inside the caller's list", async () => {
    const harness = new TestHarness();
    const { familyId } = await signInAndGetFamily(harness);
    const listId = createListFixture(familyId);

    const res = await harness.invokeHandler("/api/jobs", "POST", {
      listId,
      name: "Walk the dog",
      points: 5,
    });

    expect(res.status).toBe(200);
    expect(res.body.list_id).toBe(listId);
    expect(res.body.name).toBe("Walk the dog");
  });

  it("PUT /api/jobs/[jobId] walks todo -> doing -> done and pays points once", async () => {
    const harness = new TestHarness();
    const { familyId, userId } = await signInAndGetFamily(harness);
    const listId = createListFixture(familyId);

    const created = await harness.invokeHandler("/api/jobs", "POST", {
      listId, name: "Dishes", points: 10, assignedTo: userId,
    });
    const jobId = created.body.id;

    const doing = await harness.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "doing" }, { jobId });
    expect(doing.status).toBe(200);
    expect(doing.body.job.status).toBe("doing");

    const done = await harness.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "done" }, { jobId });
    expect(done.status).toBe(200);
    expect(done.body.job.status).toBe("done");
    expect(done.body.job.completedAt).toBeTruthy();
    expect(pointsOf(userId)).toBe(10);

    // done is terminal: no second payout, no status change
    const again = await harness.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "done" }, { jobId });
    expect(again.status).toBe(400);
    const reopen = await harness.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "todo" }, { jobId });
    expect(reopen.status).toBe(400);
    expect(pointsOf(userId)).toBe(10);
  });

  it("PUT /api/jobs/[jobId] rejects an unknown status", async () => {
    const harness = new TestHarness();
    const { familyId } = await signInAndGetFamily(harness);
    const listId = createListFixture(familyId);
    const created = await harness.invokeHandler("/api/jobs", "POST", { listId, name: "Odd", points: 1 });

    const res = await harness.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "banana" }, { jobId: created.body.id });
    expect(res.status).toBe(400);
  });

  it("GET /api/jobs does not leak another family's list", async () => {
    const other = new TestHarness();
    const otherIdentity = await signInAndGetFamily(other, "other@choretle.dev");
    const foreignList = createListFixture(otherIdentity.familyId);

    const harness = new TestHarness();
    await signInAndGetFamily(harness);

    const res = await harness.invokeHandler(`/api/jobs?listId=${foreignList}`, "GET");
    expect(res.status).toBe(404);
  });
});
