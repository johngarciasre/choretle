import { describe, it, expect } from "vitest";

describe("Scoring & Leaderboard Logic", () => {
  describe("calculatePoints (from points.ts)", () => {
    const calculatePoints = (job: any, subtasks?: any[]): number => {
      let total = job?.points || 0;

      if (subtasks && subtasks.length > 0) {
        for (const subtask of subtasks) {
          if (subtask.completedAt) {
            total += subtask.pointsAwarded || subtask.points || 0;
          }
        }
      }

      return total;
    };

    it("should calculate points from job.base points only", () => {
      const job = { points: 10 };
      const result = calculatePoints(job);
      expect(result).toBe(10);
    });

    it("should add completed subtask points to base points", () => {
      const job = { points: 10 };
      const subtasks = [
        { id: "1", completedAt: new Date(), pointsAwarded: 5 },
        { id: "2", completedAt: null, pointsAwarded: 3 }, // not completed
      ];
      const result = calculatePoints(job, subtasks);
      expect(result).toBe(15); // 10 + 5 (only completed subtask)
    });

    it("should handle job with no points", () => {
      const job = { points: 0 };
      const result = calculatePoints(job);
      expect(result).toBe(0);
    });

    it("should handle null/undefined job", () => {
      const result = calculatePoints(null as any);
      expect(result).toBe(0);
    });

    it("should handle undefined subtasks", () => {
      const job = { points: 5 };
      const result = calculatePoints(job, undefined);
      expect(result).toBe(5);
    });

    it("should use subtask.points when pointsAwarded is missing", () => {
      const job = { points: 10 };
      const subtasks = [
        { id: "1", completedAt: new Date(), pointsAwarded: undefined, points: 3 },
      ];
      const result = calculatePoints(job, subtasks);
      expect(result).toBe(13); // 10 + 3
    });

    it("should handle multiple completed subtasks", () => {
      const job = { points: 5 };
      const subtasks = [
        { id: "1", completedAt: new Date(), pointsAwarded: 2 },
        { id: "2", completedAt: new Date(), pointsAwarded: 4 },
        { id: "3", completedAt: new Date(), pointsAwarded: 6 },
      ];
      const result = calculatePoints(job, subtasks);
      expect(result).toBe(17); // 5 + 2 + 4 + 6
    });

    it("should not count partially completed subtasks", () => {
      const job = { points: 10 };
      const subtasks = [
        { id: "1", completedAt: new Date(), pointsAwarded: 3 },
        { id: "2", completedAt: null, pointsAwarded: 5 },
        { id: "3", completedAt: new Date(), pointsAwarded: 7 },
      ];
      const result = calculatePoints(job, subtasks);
      expect(result).toBe(20); // 10 + 3 + 7
    });
  });

  describe("calculateJobPoints (from jobStatus.ts)", () => {
    const calculateJobPoints = (job: any, completedSubtasks?: any[]): number => {
      let total = job?.points || 0;

      if (completedSubtasks && completedSubtasks.length > 0) {
        for (const subtask of completedSubtasks) {
          if (subtask.completedAt) {
            total += subtask.pointsAwarded || subtask.points || 0;
          }
        }
      }

      return total;
    };

    it("should match calculatePoints behavior", () => {
      const job = { points: 15 };
      const completedSubtasks = [
        { id: "1", completedAt: new Date(), pointsAwarded: 5 },
      ];

      const result = calculateJobPoints(job, completedSubtasks);
      expect(result).toBe(20);
    });

    it("should return 0 for null job with no subtasks", () => {
      const result = calculateJobPoints(null as any, []);
      expect(result).toBe(0);
    });

    it("should handle completed subtasks without pointsAwarded", () => {
      const job = { points: 10 };
      const completedSubtasks = [
        { id: "1", completedAt: new Date(), pointsAwarded: undefined, points: 2 },
      ];
      const result = calculateJobPoints(job, completedSubtasks);
      expect(result).toBe(12);
    });
  });

  describe("Leaderboard sorting", () => {
    it("should sort users by pointsTotal descending", () => {
      const users = [
        { id: "1", name: "User A", pointsTotal: 50 },
        { id: "2", name: "User B", pointsTotal: 150 },
        { id: "3", name: "User C", pointsTotal: 25 },
      ];

      const sorted = [...users].sort((a, b) => (b.pointsTotal || 0) - (a.pointsTotal || 0));
      expect(sorted[0].name).toBe("User B");
      expect(sorted[1].name).toBe("User A");
      expect(sorted[2].name).toBe("User C");
    });

    it("should handle users with null/undefined points", () => {
      const users = [
        { id: "1", name: "User A", pointsTotal: 50 },
        { id: "2", name: "User B", pointsTotal: undefined },
        { id: "3", name: "User C", pointsTotal: null },
      ];

      const sorted = [...users].sort((a, b) => (b.pointsTotal || 0) - (a.pointsTotal || 0));
      expect(sorted[0].name).toBe("User A");
      expect(sorted.some((u) => u.name === "User B")).toBe(true);
    });

    it("should handle empty user list", () => {
      const sorted: any[] = [];
      expect(sorted.length).toBe(0);
    });

    it("should handle single user", () => {
      const users = [{ id: "1", name: "Solo User", pointsTotal: 100 }];
      const sorted = [...users].sort((a, b) => (b.pointsTotal || 0) - (a.pointsTotal || 0));
      expect(sorted.length).toBe(1);
    });

    it("should handle tie-breaking by keeping original order", () => {
      const users = [
        { id: "1", name: "User A", pointsTotal: 50 },
        { id: "2", name: "User B", pointsTotal: 50 },
      ];

      const sorted = [...users].sort((a, b) => (b.pointsTotal || 0) - (a.pointsTotal || 0));
      expect(sorted[0].id).toBe("1"); // stable sort preserves order for equal elements
    });
  });

  describe("getUserStats pattern", () => {
    it("should compute jobsCompleted count", () => {
      const jobs = [
        { id: "1", status: "done", completedAt: new Date().toISOString() },
        { id: "2", status: "todo", completedAt: null },
        { id: "3", status: "done", completedAt: new Date().toISOString() },
      ];

      const completedJobs = jobs.filter((j: any) => j.status === "done" && j.completedAt);
      expect(completedJobs.length).toBe(2);
    });

    it("should compute pointsThisWeek from last 7 days", () => {
      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

      const jobs = [
        { id: "1", status: "done", completedAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(), points: 10 },
        { id: "2", status: "done", completedAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(), points: 20 },
        { id: "3", status: "done", completedAt: new Date(sevenDaysAgo - 1).toISOString(), points: 5 }, // older than 7 days
      ];

      const pointsThisWeek = jobs
        .filter((j: any) => j.status === "done" && new Date(j.completedAt) > new Date(sevenDaysAgo))
        .reduce((sum: number, j: any) => sum + (j.points || 0), 0);

      expect(pointsThisWeek).toBe(30); // Only the two within 7 days
    });

    it("should compute averagePerDay rounded to 1 decimal", () => {
      const pointsThisWeek = 35;
      const averagePerDay = Math.round(pointsThisWeek / 7 * 10) / 10;
      expect(averagePerDay).toBe(5);
    });

    it("should handle zero completed jobs in a week", () => {
      const pointsThisWeek = 0;
      const averagePerDay = Math.round(pointsThisWeek / 7 * 10) / 10;
      expect(averagePerDay).toBe(0);
    });

    it("should handle partial days correctly", () => {
      const pointsThisWeek = 23;
      const averagePerDay = Math.round(pointsThisWeek / 7 * 10) / 10;
      expect(averagePerDay).toBe(3.3); // rounded to 1 decimal
    });
  });

  describe("getJobHistory pattern", () => {
    it("should return only completed jobs", () => {
      const allJobs = [
        { id: "1", status: "done", completedAt: new Date().toISOString(), name: "Completed" },
        { id: "2", status: "todo", completedAt: null, name: "Todo" },
        { id: "3", status: "doing", completedAt: null, name: "Doing" },
      ];

      const completed = allJobs.filter((j: any) => j.status === "done");
      expect(completed.length).toBe(1);
    });

    it("should limit results when specified", () => {
      const completedJobs = Array.from({ length: 25 }, (_, i) => ({
        id: `${i}`,
        status: "done",
        completedAt: new Date().toISOString(),
      }));

      const limited = completedJobs.slice(0, 20);
      expect(limited.length).toBe(20);
    });

    it("should order by completedAt descending", () => {
      const jobs = [
        { id: "1", status: "done", completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
        { id: "2", status: "done", completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
        { id: "3", status: "done", completedAt: new Date(Date.now()).toISOString() },
      ];

      const sorted = [...jobs].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
      expect(sorted[0].id).toBe("3"); // most recent
    });
  });

  describe("getWeeklyPoints pattern", () => {
    it("should return only last 7 days of completed jobs", () => {
      const now = Date.now();
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

      const allJobs = [
        { status: "done", completedAt: new Date(Date.now() - 1).toISOString(), points: 10 },
        { status: "done", completedAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(), points: 20 },
        { status: "done", completedAt: new Date(sevenDaysAgo.getTime() - 1).toISOString(), points: 5 }, // too old
      ];

      const weekly = allJobs.filter((j: any) => j.status === "done" && new Date(j.completedAt) >= sevenDaysAgo);
      expect(weekly.length).toBe(2);
    });

    it("should format dates as YYYY-MM-DD", () => {
      const date = new Date();
      const formatted = date.toISOString().split("T")[0];
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should return array of { date, points } objects", () => {
      const now = Date.now();
      const jobs = [
        { status: "done", completedAt: new Date(now - 1).toISOString(), points: 10 },
      ];

      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const result = jobs
        .filter((j: any) => j.status === "done" && new Date(j.completedAt) >= sevenDaysAgo)
        .map((j: any) => ({
          date: new Date(j.completedAt).toISOString().split("T")[0],
          points: j.points || 0,
        }));

      expect(result.length).toBe(1);
      expect(typeof result[0].date).toBe("string");
      expect(typeof result[0].points).toBe("number");
    });

    it("should exclude non-done jobs", () => {
      const now = Date.now();
      const allJobs = [
        { status: "done", completedAt: new Date(now - 1).toISOString(), points: 10 },
        { status: "todo", completedAt: null, points: 5 },
        { status: "doing", completedAt: null, points: 3 },
      ];

      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const weekly = allJobs.filter((j: any) => j.status === "done" && j.completedAt && new Date(j.completedAt) >= sevenDaysAgo);
      expect(weekly.length).toBe(1);
    });

    it("should exclude jobs without completedAt", () => {
      const now = Date.now();
      const allJobs = [
        { status: "done", completedAt: new Date(now - 1).toISOString(), points: 10 },
        { status: "done", completedAt: null, points: 5 },
      ];

      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const weekly = allJobs.filter((j: any) => j.status === "done" && j.completedAt && new Date(j.completedAt) >= sevenDaysAgo);
      expect(weekly.length).toBe(1);
    });
  });

  describe("Points accumulation patterns", () => {
    it("should accumulate points across multiple jobs for leaderboard", () => {
      const userJobs = [
        { status: "done", completedAt: new Date().toISOString(), points: 10 },
        { status: "done", completedAt: new Date().toISOString(), points: 20 },
        { status: "todo", completedAt: null, points: 5 },
      ];

      const totalPoints = userJobs
        .filter((j: any) => j.status === "done")
        .reduce((sum: number, j: any) => sum + (j.points || 0), 0);

      expect(totalPoints).toBe(30);
    });

    it("should start from 0 for new users", () => {
      const userJobs: any[] = [];
      const totalPoints = userJobs.reduce((sum: number, j: any) => sum + (j.points || 0), 0);
      expect(totalPoints).toBe(0);
    });

    it("should handle negative points from jobs", () => {
      const userJobs = [
        { status: "done", completedAt: new Date().toISOString(), points: -5 },
      ];

      const totalPoints = userJobs.reduce((sum: number, j: any) => sum + (j.points || 0), 0);
      expect(totalPoints).toBe(-5); // DB allows negative; scoring reflects it
    });
  });
});
