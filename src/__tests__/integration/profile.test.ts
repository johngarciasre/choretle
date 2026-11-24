import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb, getRawDb } from "@/db/drizzle";
import { signInAndGetFamily, addFamilyMember, createListFixture } from "./fixtures";
import { buildProfileView } from "@/lib/profile-view";

const DAY = 24 * 60 * 60 * 1000;

async function doneJob(
  harness: TestHarness,
  opts: { familyId: string; assignedTo: string; name: string; points: number; daysAgo: number },
): Promise<string> {
  const listId = createListFixture(opts.familyId, new Date(Date.now() - opts.daysAgo * DAY));
  const created = await harness.invokeHandler("/api/jobs", "POST", {
    listId, name: opts.name, points: opts.points, assignedTo: opts.assignedTo,
  });
  expect(created.status).toBe(200);
  const done = await harness.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "done" }, { jobId: created.body.id });
  expect(done.status).toBe(200);
  getRawDb()!
    .prepare(`UPDATE jobs SET completed_at = ? WHERE id = ?`)
    .run(new Date(Date.now() - opts.daysAgo * DAY).toISOString(), created.body.id);
  return created.body.id;
}

describe("Profile API", () => {
  beforeEach(() => {
    resetDb();
  });

  it("feeds the profile page's view model with real numbers", async () => {
    const parent = new TestHarness();
    const { familyId, userId: parentId } = await signInAndGetFamily(parent);
    const childId = addFamilyMember(familyId);

    await doneJob(parent, { familyId, assignedTo: childId, name: "Dishes", points: 10, daysAgo: 0 });
    await doneJob(parent, { familyId, assignedTo: childId, name: "Bins", points: 5, daysAgo: 10 });
    // Another member's work must not appear on this profile.
    await doneJob(parent, { familyId, assignedTo: parentId, name: "Garage", points: 99, daysAgo: 0 });

    const res = await parent.invokeHandler("/api/profile/[id]", "GET", undefined, { id: childId });
    expect(res.status).toBe(200);

    // The route contract the page depends on.
    expect(res.body.user).toMatchObject({ id: childId, role: "child", pointsTotal: 15 });
    expect(res.body.user.createdAt).toBeTruthy();
    expect(res.body.user.streakCount).toBe(1);
    expect(res.body.completedJobs).toHaveLength(2);

    const view = buildProfileView(res.body, Date.now());
    expect(view.user.name).toBe("Second Member");
    expect(view.stats).toMatchObject({
      totalPoints: 15,
      jobsCompleted: 2,
      streakDays: 1,
      averagePointsPerJob: 7.5,
    });
    expect(view.stats.pointsThisWeek).toBe(10);
    expect(view.stats.pointsLastWeek).toBe(5);
    expect(view.completions.map((c) => c.name).sort()).toEqual(["Bins", "Dishes"]);
    // Jobs without a task name still get a category, so the chart is never blank.
    expect(view.completions.every((c) => c.category.length > 0)).toBe(true);
  });

  it("reports a child's own points as awarded, not the task template's", async () => {
    const parent = new TestHarness();
    const { familyId } = await signInAndGetFamily(parent);
    const childId = addFamilyMember(familyId);

    await doneJob(parent, { familyId, assignedTo: childId, name: "Sweep", points: 7, daysAgo: 0 });

    const res = await parent.invokeHandler("/api/profile/[id]", "GET", undefined, { id: childId });
    const view = buildProfileView(res.body, Date.now());

    expect(view.completions[0].points).toBe(7);
    expect(view.stats.totalPoints).toBe(7);
  });

  it("does not expose a member of another family", async () => {
    const mine = new TestHarness();
    await signInAndGetFamily(mine);

    const other = new TestHarness();
    const otherIdentity = await signInAndGetFamily(other, "other@choretle.dev");

    const res = await mine.invokeHandler("/api/profile/[id]", "GET", undefined, { id: otherIdentity.userId });
    expect(res.status).toBe(404);
  });
});
