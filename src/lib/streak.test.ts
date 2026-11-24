import { describe, it, expect } from "vitest";
import { currentStreakFromDays } from "./streak";

// Fixed "today" so this test never depends on the clock.
const TODAY = new Date("2026-03-15T12:00:00Z");

describe("currentStreakFromDays", () => {
  it("counts consecutive days ending today", () => {
    expect(currentStreakFromDays(["2026-03-15", "2026-03-14", "2026-03-13"], TODAY)).toBe(3);
  });

  it("keeps the streak while today is still in progress", () => {
    expect(currentStreakFromDays(["2026-03-14", "2026-03-13"], TODAY)).toBe(2);
  });

  it("breaks on a gap", () => {
    // 13th and 11th are not consecutive; the run ends on the 13th but it is
    // two days stale, so the current streak is 0.
    expect(currentStreakFromDays(["2026-03-13", "2026-03-11"], TODAY)).toBe(0);
    expect(currentStreakFromDays(["2026-03-15", "2026-03-13", "2026-03-12"], TODAY)).toBe(1);
  });

  it("counts every day once regardless of duplicate rows", () => {
    expect(currentStreakFromDays(["2026-03-15", "2026-03-15", "2026-03-14"], TODAY)).toBe(2);
  });

  it("returns 0 with no completions", () => {
    expect(currentStreakFromDays([], TODAY)).toBe(0);
  });
});
