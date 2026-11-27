import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb, getDb } from "@/db";
import { signInAndGetHousehold, addHouseholdMember, createListFixture, signInAsChild } from "./fixtures";
import { buildProfileView } from "@/lib/profile-view";

const DAY = 24 * 60 * 60 * 1000;

async function doneJob(
  harness: TestHarness,
  opts: { householdId: string; assignedTo: string; name: string; points: number; daysAgo: number },
): Promise<string> {
  const listId = await createListFixture(opts.householdId, new Date(Date.now() - opts.daysAgo * DAY));
  const created = await harness.invokeHandler("/api/jobs", "POST", {
    listId, name: opts.name, points: opts.points, assignedTo: opts.assignedTo,
  });
  expect(created.status).toBe(200);
  const done = await harness.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "done" }, { jobId: created.body.id });
  expect(done.status).toBe(200);
  getDb()!
    .prepare(`UPDATE jobs SET completed_at = ? WHERE id = ?`)
    .run(new Date(Date.now() - opts.daysAgo * DAY).toISOString(), created.body.id);
  return created.body.id;
}

describe("Profile API", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("feeds the profile page's view model with real numbers", async () => {
    const parent = new TestHarness();
    const { householdId, userId: parentId } = await signInAndGetHousehold(parent);
    const childId = await addHouseholdMember(householdId);

    await doneJob(parent, { householdId, assignedTo: childId, name: "Dishes", points: 10, daysAgo: 0 });
    await doneJob(parent, { householdId, assignedTo: childId, name: "Bins", points: 5, daysAgo: 10 });
    // Another member's work must not appear on this profile.
    await doneJob(parent, { householdId, assignedTo: parentId, name: "Garage", points: 99, daysAgo: 0 });

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
    const { householdId } = await signInAndGetHousehold(parent);
    const childId = await addHouseholdMember(householdId);

    await doneJob(parent, { householdId, assignedTo: childId, name: "Sweep", points: 7, daysAgo: 0 });

    const res = await parent.invokeHandler("/api/profile/[id]", "GET", undefined, { id: childId });
    const view = buildProfileView(res.body, Date.now());

    expect(view.completions[0].points).toBe(7);
    expect(view.stats.totalPoints).toBe(7);
  });

  it("does not expose a member of another household", async () => {
    const mine = new TestHarness();
    await signInAndGetHousehold(mine);

    const other = new TestHarness();
    const otherIdentity = await signInAndGetHousehold(other, "other@choretle.dev");

    const res = await mine.invokeHandler("/api/profile/[id]", "GET", undefined, { id: otherIdentity.userId });
    expect(res.status).toBe(404);
  });
});

describe("Profile photo API", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("stores the child's own photo and exposes it on the profile", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);
    const { harness: kid, childId } = await signInAsChild(householdId);
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

    const put = await kid.invokeHandler("/api/profile/[id]", "PUT", { avatarUrl: png }, { id: childId });
    expect(put.status).toBe(200);
    expect(put.body.user.avatarUrl).toBe(png);

    const get = await parent.invokeHandler("/api/profile/[id]", "GET", undefined, { id: childId });
    expect(get.body.user.avatarUrl).toBe(png);

    const cleared = await kid.invokeHandler("/api/profile/[id]", "PUT", { avatarUrl: null }, { id: childId });
    expect(cleared.status).toBe(200);
    const afterClear = await parent.invokeHandler("/api/profile/[id]", "GET", undefined, { id: childId });
    expect(afterClear.body.user.avatarUrl).toBeNull();
  });

  it("lets a parent set a kid's photo, but not a child's peer", async () => {
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent);
    const kidA = await addHouseholdMember(householdId);
    const { harness: kidB, childId: kidBId } = await signInAsChild(householdId);

    const byParent = await parent.invokeHandler("/api/profile/[id]", "PUT", { avatarUrl: "/api/avatars/u-mike.jpg" }, { id: kidA });
    expect(byParent.status).toBe(200);

    const byPeer = await kidB.invokeHandler("/api/profile/[id]", "PUT", { avatarUrl: "/api/avatars/u-mike.jpg" }, { id: kidA });
    expect(byPeer.status).toBe(403);

    const bySelf = await kidB.invokeHandler("/api/profile/[id]", "PUT", { avatarUrl: "/api/avatars/u-jan.jpg" }, { id: kidBId });
    expect(bySelf.status).toBe(200);
    expect(bySelf.body.user.avatarUrl).toBe("/api/avatars/u-jan.jpg");
  });

  it("accepts an uploaded picture sent as a data URL", async () => {
    const parent = new TestHarness();
    const { userId } = await signInAndGetHousehold(parent);
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

    const res = await parent.invokeHandler("/api/profile/[id]", "PUT", { avatarUrl: png }, { id: userId });
    expect(res.status).toBe(200);
    expect(res.body.user.avatarUrl).toBe(png);
  });

  it("rejects off-site and non-image URLs", async () => {
    const parent = new TestHarness();
    const { userId } = await signInAndGetHousehold(parent);

    for (const avatarUrl of [
      "javascript:alert(1)",
      "//evil.example/x.png",
      "https://example.com/public-photo.jpg",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:text/html;base64,PGI+",
      "/avatars/u-mike.jpg",
      "/api/avatars/../../package.json",
      "/api/avatars/u-mike.svg",
      "not a url",
      42,
    ]) {
      const res = await parent.invokeHandler("/api/profile/[id]", "PUT", { avatarUrl }, { id: userId });
      expect(res.status, `avatarUrl=${String(avatarUrl)}`).toBe(400);
    }
  });

  it("won't touch a member of another household", async () => {
    const mine = new TestHarness();
    await signInAndGetHousehold(mine);

    const other = new TestHarness();
    const otherIdentity = await signInAndGetHousehold(other, "other@choretle.dev");

    const res = await mine.invokeHandler("/api/profile/[id]", "PUT", { avatarUrl: "/api/avatars/u-mike.jpg" }, { id: otherIdentity.userId });
    expect(res.status).toBe(404);
  });
});
