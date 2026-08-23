import { describe, it, expect } from "vitest";
import {
  calculateStreak,
  calculateLongestStreak,
} from "@/lib/streak";

// Helper to create dates relative to a fixed base date
const BASE_DATE = new Date("2024-01-15T00:00:00Z"); // Monday Jan 15, 2024
function addDays(base: Date, days: number): Date {
  const result = new Date(base);
  result.setDate(result.getDate() + days);
  return result;
}

describe("calculateStreak", () => {
  it("returns 0 for empty array", () => {
    expect(calculateStreak([])).toBe(0);
  });

  it("returns 0 for array without completedAt", () => {
    expect(calculateStreak([{ completedAt: undefined }] as any)).toBe(0);
  });

  it("calculates consecutive daily streak from today backwards", () => {
    const now = addDays(BASE_DATE, 5); // Jan 20 (Sunday)
    const jobs = [
      { completedAt: now.toISOString() }, // today
      { completedAt: addDays(BASE_DATE, 4).toISOString() }, // yesterday
      { completedAt: addDays(BASE_DATE, 3).toISOString() }, // 2 days ago
    ];
    expect(calculateStreak(jobs)).toBe(3);
  });

  it("breaks streak on gap > 2 days", () => {
    const now = addDays(BASE_DATE, 5);
    const jobs = [
      { completedAt: now.toISOString() }, // today (day 5)
      { completedAt: addDays(BASE_DATE, 4).toISOString() }, // yesterday (day 4)
      { completedAt: addDays(BASE_DATE, 0).toISOString() },   // day 0 (gap of 2+ days from day 4)
    ];
    expect(calculateStreak(jobs)).toBe(2);
  });

  it("resets streak on gap of exactly 2 days", () => {
    const now = addDays(BASE_DATE, 5);
    const jobs = [
      { completedAt: now.toISOString() }, // today (day 5)
      { completedAt: addDays(BASE_DATE, 4).toISOString() }, // yesterday (day 4)
      { completedAt: addDays(BASE_DATE, 2).toISOString() }, // day 2 (gap of 2 days from day 4 - reset to current=1)
    ];
    expect(calculateStreak(jobs)).toBe(1);
  });

  it("calculates streak for 6 consecutive days", () => {
    const now = addDays(BASE_DATE, 5); // Jan 20
    const jobs = [
      { completedAt: addDays(BASE_DATE, 0).toISOString() },   // Jan 15 (day 0)
      { completedAt: addDays(BASE_DATE, 1).toISOString() },   // Jan 16 (day 1)
      { completedAt: addDays(BASE_DATE, 2).toISOString() },   // Jan 17 (day 2)
      { completedAt: addDays(BASE_DATE, 3).toISOString() },   // Jan 18 (day 3)
      { completedAt: addDays(BASE_DATE, 4).toISOString() },   // Jan 19 (day 4)
      { completedAt: now.toISOString() },                     // Jan 20 (day 5)
    ];
    expect(calculateStreak(jobs)).toBe(6);
  });

  it("calculates streak correctly with unsorted input", () => {
    // Function sorts by most recent first, so: day 5 -> day 3 -> day 2
    // day 5 to day 3 is a gap of 2 days (reset to current=1)
    // day 3 to day 2 is consecutive (streak=2)
    const jobs = [
      { completedAt: addDays(BASE_DATE, 2).toISOString() },   // day 2
      { completedAt: addDays(BASE_DATE, 5).toISOString() },   // day 5
      { completedAt: addDays(BASE_DATE, 3).toISOString() },   // day 3
    ];
    expect(calculateStreak(jobs)).toBe(2);
  });
});

describe("calculateLongestStreak", () => {
  it("returns 0 for empty array", () => {
    expect(calculateLongestStreak([])).toBe(0);
  });

  it("returns consecutive streak when no breaks", () => {
    const now = addDays(BASE_DATE, 5);
    const jobs = [
      { completedAt: addDays(BASE_DATE, 0).toISOString() },
      { completedAt: addDays(BASE_DATE, 1).toISOString() },
      { completedAt: addDays(BASE_DATE, 2).toISOString() },
      { completedAt: addDays(BASE_DATE, 3).toISOString() },
      { completedAt: addDays(BASE_DATE, 4).toISOString() },
      { completedAt: now.toISOString() },
    ];
    expect(calculateLongestStreak(jobs)).toBe(6);
  });

  it("finds longest streak with multiple breaks", () => {
    // Streak 1: days 5,4,3 (length 3)
    // Gap of 2 days (2,0) - resets to current=1
    // Streak 2: day 1 (length 1)
    const now = addDays(BASE_DATE, 5);
    const jobs = [
      { completedAt: now.toISOString() },
      { completedAt: addDays(BASE_DATE, 4).toISOString() },
      { completedAt: addDays(BASE_DATE, 3).toISOString() },
      { completedAt: addDays(BASE_DATE, 1).toISOString() }, // gap of 2 days from day 3
    ];
    expect(calculateLongestStreak(jobs)).toBe(3);
  });

  it("handles single entry correctly", () => {
    expect(calculateLongestStreak([{ completedAt: addDays(BASE_DATE, 5).toISOString() }] as any)).toBe(1);
  });

  it("finds longest streak among multiple gaps", () => {
    // Streak A: days 7,6,5 (length 3)
    // Gap of 2 days (4,2) - resets to current=1
    // Streak B: day 3 (length 1)
    const now = addDays(BASE_DATE, 5);
    const jobs = [
      { completedAt: now.toISOString() },
      { completedAt: addDays(BASE_DATE, 6).toISOString() },
      { completedAt: addDays(BASE_DATE, 7).toISOString() },
      { completedAt: addDays(BASE_DATE, 3).toISOString() }, // gap of 2 days from day 5
    ];
    expect(calculateLongestStreak(jobs)).toBe(3);
  });

  it("handles gaps of exactly 2 days as resets", () => {
    // Streak A: day 5 (length 1)
    // Gap of 2 days (4,2) - resets to current=1
    // Streak B: day 1 (length 1)
    const now = addDays(BASE_DATE, 5);
    const jobs = [
      { completedAt: now.toISOString() },
      { completedAt: addDays(BASE_DATE, 3).toISOString() }, // gap of 2 days from day 5
    ];
    expect(calculateLongestStreak(jobs)).toBe(1);
  });

  it("handles multiple consecutive days correctly", () => {
    const jobs = [
      { completedAt: addDays(BASE_DATE, 0).toISOString() },
      { completedAt: addDays(BASE_DATE, 1).toISOString() },
      { completedAt: addDays(BASE_DATE, 2).toISOString() },
      { completedAt: addDays(BASE_DATE, 3).toISOString() },
    ];
    expect(calculateLongestStreak(jobs)).toBe(4);
  });

  it("handles gaps of 1 day as continuation", () => {
    // Day 5 -> gap of 1 day (day 4) -> day 3,2,1,0 - all consecutive
    const now = addDays(BASE_DATE, 5);
    const jobs = [
      { completedAt: now.toISOString() },
      { completedAt: addDays(BASE_DATE, 4).toISOString() }, // exactly 1 day gap - continues streak
      { completedAt: addDays(BASE_DATE, 3).toISOString() },
      { completedAt: addDays(BASE_DATE, 2).toISOString() },
    ];
    expect(calculateLongestStreak(jobs)).toBe(4);
  });

  it("handles mixed gaps correctly - continues after 1-day gap", () => {
    // Day 5 -> day 4 (gap of 1) -> day 3 -> gap of 2 days (day 2,0) -> day 1
    const now = addDays(BASE_DATE, 5);
    const jobs = [
      { completedAt: now.toISOString() }, // day 5
      { completedAt: addDays(BASE_DATE, 4).toISOString() }, // day 4 (gap of 1 - continues)
      { completedAt: addDays(BASE_DATE, 3).toISOString() }, // day 3
      { completedAt: addDays(BASE_DATE, 1).toISOString() }, // day 1 (gap of 2 from day 3 - reset)
    ];
    expect(calculateLongestStreak(jobs)).toBe(3); // Streak 5-4-3 = 3 days
  });

  it("handles gap of 3+ days as termination", () => {
    // Day 5 -> day 4 -> day 3 -> gap of 3 days (day 2,1,0) - terminates
    const now = addDays(BASE_DATE, 5);
    const jobs = [
      { completedAt: now.toISOString() },
      { completedAt: addDays(BASE_DATE, 4).toISOString() },
      { completedAt: addDays(BASE_DATE, 3).toISOString() },
      { completedAt: addDays(BASE_DATE, -1).toISOString() }, // gap of 4 days from day 3 - terminates
    ];
    expect(calculateLongestStreak(jobs)).toBe(3);
  });

  it("handles single day streak after gap correctly", () => {
    const now = addDays(BASE_DATE, 5);
    const jobs = [
      { completedAt: now.toISOString() }, // day 5 (streak=1)
      { completedAt: addDays(BASE_DATE, 3).toISOString() }, // gap of 2 days (reset to current=1)
      { completedAt: addDays(BASE_DATE, 2).toISOString() }, // gap of 1 day (continues, streak=2)
    ];
    expect(calculateLongestStreak(jobs)).toBe(2);
  });

  it("handles alternating gaps correctly", () => {
    // Day 5 -> day 4 -> gap of 2 days (day 3,1) -> day 2 -> day 1
    const now = addDays(BASE_DATE, 5);
    const jobs = [
      { completedAt: now.toISOString() },   // day 5
      { completedAt: addDays(BASE_DATE, 4).toISOString() }, // day 4 (streak=2)
      { completedAt: addDays(BASE_DATE, 2).toISOString() }, // gap of 2 days from day 4 (reset to current=1)
      { completedAt: addDays(BASE_DATE, 1).toISOString() }, // gap of 1 day from day 2 (continues, streak=2)
    ];
    expect(calculateLongestStreak(jobs)).toBe(2);
  });

  it("handles gaps spanning weekends correctly", () => {
    // Simulating: Jan 20 (Sat), Jan 19 (Fri), gap of 4 days (Jan 18-14 skipped), Jan 13 (Thu)
    const now = addDays(BASE_DATE, 5); // Jan 20
    const jobs = [
      { completedAt: now.toISOString() },   // Jan 20
      { completedAt: addDays(BASE_DATE, 4).toISOString() }, // Jan 19 (gap=1, continues, streak=2)
      { completedAt: addDays(BASE_DATE, -7).toISOString() }, // Jan 8 (gap=11 from Jan 19, terminates)
    ];
    expect(calculateLongestStreak(jobs)).toBe(2);
  });
});
