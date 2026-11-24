import { describe, it, expect } from "vitest";
import { buildProfileView, longestStreakFromDays, type ProfileApiResponse } from "./profile-view";

// Fixed "now": 2026-03-15T12:00:00Z
const NOW = Date.parse("2026-03-15T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

describe("longestStreakFromDays", () => {
  it("returns 0 with no days", () => {
    expect(longestStreakFromDays([])).toBe(0);
  });

  it("counts the longest run, not the current one", () => {
    // 3-day run, gap, 2-day run
    expect(longestStreakFromDays(["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-10", "2026-03-11"])).toBe(3);
  });

  it("deduplicates and ignores unsorted input", () => {
    expect(longestStreakFromDays(["2026-03-03", "2026-03-01", "2026-03-02", "2026-03-02"])).toBe(3);
  });

  it("ignores malformed entries", () => {
    expect(longestStreakFromDays(["", "not-a-date", "2026-03-01"])).toBe(1);
  });
});

describe("buildProfileView", () => {
  const response: ProfileApiResponse = {
    user: {
      id: "kid-1",
      name: "Robin",
      email: "robin@choretle.dev",
      role: "child",
      avatarUrl: null,
      pointsTotal: 30,
      streakCount: 2,
      createdAt: "2026-01-05T00:00:00.000Z",
    },
    completedJobs: [
      { id: "j1", name: "Dishes", taskName: "Kitchen duty", points: 10, completedAt: iso(1) },
      { id: "j2", name: "Bins", taskName: null, points: 5, completedAt: iso(3) },
      { id: "j3", name: "Hoover", taskName: "Cleaning", points: 15, completedAt: iso(10) },
    ],
  };

  it("maps the user and keeps the join date", () => {
    const view = buildProfileView(response, NOW);

    expect(view.user).toMatchObject({
      id: "kid-1",
      name: "Robin",
      role: "child",
      pointsTotal: 30,
      createdAt: "2026-01-05T00:00:00.000Z",
    });
    expect(view.user.avatarUrl).toBeUndefined();
  });

  it("splits points into this week and last week", () => {
    const view = buildProfileView(response, NOW);

    expect(view.stats.pointsThisWeek).toBe(15); // 10 + 5, within 7 days
    expect(view.stats.pointsLastWeek).toBe(15); // 15, 8-14 days ago
    expect(view.stats.totalPoints).toBe(30);
  });

  it("derives jobs, average and streak figures", () => {
    const view = buildProfileView(response, NOW);

    expect(view.stats.jobsCompleted).toBe(3);
    expect(view.stats.averagePointsPerJob).toBe(10); // 30 / 3
    expect(view.stats.streakDays).toBe(2); // from the API's streakCount
    expect(view.stats.longestStreak).toBe(1); // the three dates are not consecutive
  });

  it("uses the task name as the category, falling back to the job name", () => {
    const view = buildProfileView(response, NOW);

    expect(view.completions.map((c) => c.category)).toEqual(["Kitchen duty", "Bins", "Cleaning"]);
    expect(view.completions[0]).toMatchObject({ id: "j1", points: 10, name: "Dishes" });
  });

  it("survives an empty or malformed payload", () => {
    const view = buildProfileView({ user: null, completedJobs: null }, NOW);

    expect(view.user).toMatchObject({ id: "", name: "", role: "child", pointsTotal: 0 });
    expect(view.stats).toMatchObject({ jobsCompleted: 0, averagePointsPerJob: 0, longestStreak: 0 });
    expect(view.completions).toEqual([]);
  });

  it("ignores completions with an unparseable date when bucketing points", () => {
    const view = buildProfileView(
      { user: { pointsTotal: 5 }, completedJobs: [{ id: "j", name: "Odd", points: 5, completedAt: null }] },
      NOW,
    );

    expect(view.stats.pointsThisWeek).toBe(0);
    expect(view.stats.jobsCompleted).toBe(1);
  });
});
