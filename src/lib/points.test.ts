import { describe, it, expect } from "vitest";
import {
  calculatePoints,
  getFrequencyDays,
  shouldGenerateList,
  findActiveSlatesForDate,
} from "@/lib/points";

describe("calculatePoints", () => {
  it("returns job points when no subtasks provided", () => {
    const job = { points: 10 };
    expect(calculatePoints(job)).toBe(10);
  });

  it("adds completed subtask points to total", () => {
    const job = { points: 5 };
    const subtasks = [
      { completedAt: new Date(), pointsAwarded: 3 },
      { completedAt: null, pointsAwarded: 2 },
    ];
    expect(calculatePoints(job, subtasks)).toBe(8); // 5 + 3 + 0 (only completed)
  });

  it("returns 0 for job with no points", () => {
    const job = { points: 0 };
    expect(calculatePoints(job)).toBe(0);
  });

  it("handles null/undefined subtasks gracefully", () => {
    expect(calculatePoints({ points: 5 }, undefined)).toBe(5);
    expect(calculatePoints({})).toBe(0);
  });

  it("adds all completed subtask points when all are completed", () => {
    const job = { points: 10 };
    const subtasks = [
      { completedAt: new Date(), pointsAwarded: 3 },
      { completedAt: new Date(), pointsAwarded: 2 },
      { completedAt: new Date(), pointsAwarded: 1 },
    ];
    expect(calculatePoints(job, subtasks)).toBe(16); // 10 + 3 + 2 + 1
  });

  it("skips uncompleted subtasks", () => {
    const job = { points: 10 };
    const subtasks = [
      { completedAt: null, pointsAwarded: 5 },
      { completedAt: new Date(), pointsAwarded: 3 },
    ];
    expect(calculatePoints(job, subtasks)).toBe(13); // 10 + 0 + 3
  });
});

describe("getFrequencyDays", () => {
  it("maps daily to 1 day", () => {
    expect(getFrequencyDays("daily", 1)).toBe(1);
  });

  it("maps weekly to 7 days", () => {
    expect(getFrequencyDays("weekly", 1)).toBe(7);
  });

  it("maps biweekly to 14 days", () => {
    expect(getFrequencyDays("biweekly", 1)).toBe(14);
  });

  it("maps monthly to 30 days", () => {
    expect(getFrequencyDays("monthly", 1)).toBe(30);
  });

  it("multiplies by interval", () => {
    expect(getFrequencyDays("weekly", 2)).toBe(14); // every 2 weeks
    expect(getFrequencyDays("daily", 2)).toBe(2); // every other day
  });

  it("defaults to weekly (7) for unknown frequency", () => {
    expect(getFrequencyDays("unknown", 1)).toBe(7);
  });
});

describe("shouldGenerateList", () => {
  it("returns false when slate is inactive", () => {
    const slate = { isActive: false, createdAt: new Date(), frequency: "weekly", interval: 1 };
    expect(shouldGenerateList(slate, new Date())).toBe(false);
  });

  it("returns true when days since creation is divisible by frequencyDays (daily)", () => {
    const created = new Date();
    created.setDate(created.getDate() - 3); // 3 days ago
    const slate = { isActive: true, createdAt: created, frequency: "daily", interval: 1 };
    expect(shouldGenerateList(slate, new Date())).toBe(true);
  });

  it("returns true when days since creation is divisible by frequencyDays (weekly)", () => {
    const created = new Date();
    created.setDate(created.getDate() - 7); // 7 days ago (1 week)
    const slate = { isActive: true, createdAt: created, frequency: "weekly", interval: 1 };
    expect(shouldGenerateList(slate, new Date())).toBe(true);
  });

  it("returns false when days since creation is NOT divisible by frequencyDays", () => {
    const created = new Date();
    created.setDate(created.getDate() - 5); // 5 days ago (not a multiple of 7)
    const slate = { isActive: true, createdAt: created, frequency: "weekly", interval: 1 };
    expect(shouldGenerateList(slate, new Date())).toBe(false);
  });

  it("returns false when targetDate is before createdAt", () => {
    const created = new Date();
    created.setDate(created.getDate() + 1); // 1 day in the future
    const slate = { isActive: true, createdAt: created, frequency: "weekly", interval: 1 };
    expect(shouldGenerateList(slate, new Date())).toBe(false);
  });

  it("handles biweekly frequency (14 days)", () => {
    const created = new Date();
    created.setDate(created.getDate() - 14); // 14 days ago (2 weeks)
    const slate = { isActive: true, createdAt: created, frequency: "biweekly", interval: 1 };
    expect(shouldGenerateList(slate, new Date())).toBe(true);

    // Not divisible by 14 should return false
    const partial = new Date();
    partial.setDate(partial.getDate() - 7);
    const slate2 = { isActive: true, createdAt: partial, frequency: "biweekly", interval: 1 };
    expect(shouldGenerateList(slate2, new Date())).toBe(false);
  });

  it("handles interval multiplier (weekly * 2 = every 14 days)", () => {
    const created = new Date();
    created.setDate(created.getDate() - 14); // 14 days ago
    const slate = { isActive: true, createdAt: created, frequency: "weekly", interval: 2 };
    expect(shouldGenerateList(slate, new Date())).toBe(true);
  });

  it("handles missing frequency by defaulting to weekly", () => {
    const created = new Date();
    created.setDate(created.getDate() - 7);
    const slate = { isActive: true, createdAt: created, interval: 1 };
    expect(shouldGenerateList(slate, new Date())).toBe(true);
  });
});

describe("findActiveSlatesForDate", () => {
  it("filters out inactive slates", () => {
    const now = new Date();
    // Use a date far in the past so diffDays is non-zero but not divisible by 7
    const oldDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

    const slates = [
      { id: "s1", isActive: false, createdAt: oldDate, frequency: "weekly", interval: 1 },
      { id: "s2", isActive: false, createdAt: oldDate, frequency: "weekly", interval: 1 },
    ];
    const result = findActiveSlatesForDate(slates, now);
    expect(result.length).toBe(0); // both inactive, should not match
  });

  it("returns only slates that need generation", () => {
    const now = new Date();
    // Use a date exactly 7 days ago (1 full week) for s1 to generate
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    // Use a date that is NOT divisible by 7 for s2 (so it should NOT generate)
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    const slates = [
      { id: "s1", isActive: true, createdAt: weekAgo, frequency: "weekly", interval: 1 },
      { id: "s2", isActive: true, createdAt: fiveDaysAgo, frequency: "weekly", interval: 1 },
    ];

    const result = findActiveSlatesForDate(slates, now);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("s1");
  });

  it("returns empty array when all slates are inactive", () => {
    const slates = [
      { isActive: false },
      { isActive: false },
    ];
    const result = findActiveSlatesForDate(slates, new Date());
    expect(result.length).toBe(0);
  });

  it("handles empty slate array", () => {
    const result = findActiveSlatesForDate([], new Date());
    expect(result.length).toBe(0);
  });
});
