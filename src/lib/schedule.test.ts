import { describe, it, expect } from "vitest";
import {
  defaultSchedule,
  scheduleLabel,
  legacyToSchedule,
  expandSchedule,
  shouldGenerateOnDate,
  getEffectiveDays,
} from "./schedule";

describe("defaultSchedule", () => {
  it("creates weekly default with Monday", () => {
    const s = defaultSchedule("weekly");
    expect(s.type).toBe("weekly");
    expect(s.daysOfWeek).toEqual([1]);
    expect(s.interval).toBe(1);
  });

  it("creates monthly-day default with 1st", () => {
    const s = defaultSchedule("monthly-day");
    expect(s.type).toBe("monthly-day");
    expect(s.monthDays).toEqual([1]);
  });

  it("creates monthly-week-pattern default with 1st Monday", () => {
    const s = defaultSchedule("monthly-week-pattern");
    expect(s.type).toBe("monthly-week-pattern");
    expect(s.weekOfMonth).toBe(1);
    expect(s.dayOfWeek).toBe(1);
  });
});

describe("scheduleLabel", () => {
  it("labels weekly schedule", () => {
    const s = defaultSchedule("weekly");
    expect(scheduleLabel(s)).toContain("Mon");
  });

  it("labels multi-day weekly", () => {
    const label = scheduleLabel({ type: "weekly", daysOfWeek: [1, 3, 5], interval: 1 });
    expect(label).toContain("Mon");
    expect(label).toContain("Wed");
    expect(label).toContain("Fri");
  });

  it("labels biweekly", () => {
    const label = scheduleLabel({ type: "weekly", daysOfWeek: [1], interval: 2 });
    expect(label).toContain("2 weeks");
  });

  it("labels monthly-day", () => {
    const label = scheduleLabel({ type: "monthly-day", monthDays: [1, 15], interval: 1 });
    expect(label).toContain("1st");
    expect(label).toContain("15th");
  });

  it("labels monthly-week-pattern", () => {
    const label = scheduleLabel({ type: "monthly-week-pattern", weekOfMonth: 2, dayOfWeek: 1, interval: 1 });
    expect(label).toContain("2nd");
    expect(label).toContain("Mon");
  });

  it("returns empty string for null", () => {
    expect(scheduleLabel(null as any)).toBe("");
  });
});

describe("legacyToSchedule", () => {
  it("converts weekly to schedule", () => {
    const s = legacyToSchedule("weekly", 1);
    expect(s?.type).toBe("weekly");
    expect(s?.interval).toBe(1);
  });

  it("converts biweekly to biweekly interval", () => {
    const s = legacyToSchedule("biweekly", 1);
    expect(s?.type).toBe("weekly");
    expect(s?.interval).toBe(2);
  });

  it("converts monthly to monthly-day", () => {
    const s = legacyToSchedule("monthly", 2);
    expect(s?.type).toBe("monthly-day");
    expect(s?.interval).toBe(2);
  });

  it("returns null for unknown frequency", () => {
    expect(legacyToSchedule("unknown", 1)).toBeNull();
  });
});

describe("expandSchedule - weekly", () => {
  it("expands single day of week", () => {
    const dates = expandSchedule(
      { type: "weekly", daysOfWeek: [1], interval: 1 },
      new Date("2024-01-01"), // Monday
      new Date("2024-01-31"),
    );
    expect(dates.length).toBeGreaterThan(0);
    // All dates should be Mondays
    dates.forEach((d) => {
      expect(d.date.getDay()).toBe(1);
    });
  });

  it("expands multiple days of week", () => {
    const dates = expandSchedule(
      { type: "weekly", daysOfWeek: [1, 3, 5], interval: 1 },
      new Date("2024-01-01"),
      new Date("2024-01-31"),
    );
    dates.forEach((d) => {
      expect([1, 3, 5]).toContain(d.date.getDay());
    });
  });

  it("respects interval of 2 weeks", () => {
    const dates = expandSchedule(
      { type: "weekly", daysOfWeek: [1], interval: 2 },
      new Date("2024-01-01"),
      new Date("2024-01-31"),
    );
    // With interval=2, should generate roughly half as many dates
    expect(dates.length).toBeLessThan(5);
  });
});

describe("expandSchedule - monthly-day", () => {
  it("expands single day of month", () => {
    const dates = expandSchedule(
      { type: "monthly-day", monthDays: [1], interval: 1 },
      new Date("2024-01-01"),
      new Date("2024-03-31"),
    );
    expect(dates.length).toBe(3); // Jan 1, Feb 1, Mar 1
    dates.forEach((d) => {
      expect(d.date.getDate()).toBe(1);
    });
  });

  it("expands multiple days of month", () => {
    const dates = expandSchedule(
      { type: "monthly-day", monthDays: [1, 15], interval: 1 },
      new Date("2024-01-01"),
      new Date("2024-01-31"),
    );
    expect(dates.length).toBe(2);
  });

  it("respects month interval", () => {
    const dates = expandSchedule(
      { type: "monthly-day", monthDays: [1], interval: 2 },
      new Date("2024-01-01"),
      new Date("2024-06-30"),
    );
    // Should generate for Jan, Mar, May (every other month)
    expect(dates.length).toBe(3);
  });
});

describe("expandSchedule - monthly-week-pattern", () => {
  it("expands to correct dates", () => {
    const dates = expandSchedule(
      { type: "monthly-week-pattern", weekOfMonth: 1, dayOfWeek: 1, interval: 1 },
      new Date("2024-01-01"),
      new Date("2024-03-31"),
    );
    // Each month should have exactly one date
    expect(dates.length).toBe(3);
    dates.forEach((d) => {
      expect(d.date.getDay()).toBe(1); // Monday
    });
  });

  it("handles last week pattern", () => {
    const dates = expandSchedule(
      { type: "monthly-week-pattern", weekOfMonth: 5, dayOfWeek: 5, interval: 1 },
      new Date("2024-01-01"),
      new Date("2024-01-31"),
    );
    // Last Friday of January 2024 is Jan 26
    expect(dates.length).toBe(1);
    if (dates.length > 0) {
      expect(dates[0].date.getDate()).toBe(26);
    }
  });
});

describe("shouldGenerateOnDate", () => {
  it("matches weekly schedule on correct day", () => {
    const schedule = { type: "weekly" as const, daysOfWeek: [1], interval: 1 };
    // Jan 1, 2024 is Monday (use local date constructor to avoid timezone issues)
    expect(shouldGenerateOnDate(schedule, new Date(2024, 0, 1))).toBe(true);
    // Jan 2, 2024 is Tuesday
    expect(shouldGenerateOnDate(schedule, new Date(2024, 0, 2))).toBe(false);
  });

  it("matches monthly-day schedule on correct day", () => {
    const schedule = { type: "monthly-day" as const, monthDays: [1], interval: 1 };
    expect(shouldGenerateOnDate(schedule, new Date(2024, 0, 1))).toBe(true);
    expect(shouldGenerateOnDate(schedule, new Date(2024, 0, 15))).toBe(false);
  });

  it("returns false for null schedule", () => {
    expect(shouldGenerateOnDate(null, new Date())).toBe(false);
  });
});

describe("getEffectiveDays", () => {
  it("returns 7 for weekly with interval 1", () => {
    expect(getEffectiveDays({ type: "weekly" as const, daysOfWeek: [1], interval: 1 })).toBe(7);
  });

  it("returns 14 for biweekly", () => {
    expect(getEffectiveDays({ type: "weekly" as const, daysOfWeek: [1], interval: 2 })).toBe(14);
  });

  it("returns 30 for monthly", () => {
    expect(getEffectiveDays({ type: "monthly-day" as const, monthDays: [1], interval: 1 })).toBe(30);
  });

  it("returns 60 for bimonthly", () => {
    expect(getEffectiveDays({ type: "monthly-day" as const, monthDays: [1], interval: 2 })).toBe(60);
  });

  it("returns 7 for null schedule", () => {
    expect(getEffectiveDays(null)).toBe(7);
  });
});
