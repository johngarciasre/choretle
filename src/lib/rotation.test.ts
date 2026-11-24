import { describe, it, expect } from "vitest";
import { getRotationForDate, calculateRotationAssignment, getRotationSchedule, canSwapRotations, swapRotations, getUpcomingAssignments } from "@/lib/rotation";

describe("getRotationForDate", () => {
  it("returns null when no rotations exist", () => {
    const result = getRotationForDate([], "slate-1", new Date());
    expect(result).toBeNull();
  });

  it("filters inactive rotations", () => {
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-1", order: 0, intervalDays: 7, isActive: false },
    ];
    const result = getRotationForDate(rotations, "slate-1", new Date());
    expect(result).toBeNull();
  });

  it("returns the first active rotation when only one exists", () => {
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-1", order: 0, intervalDays: 7, isActive: true },
    ];
    const result = getRotationForDate(rotations, "slate-1", new Date());
    expect(result).toBe("user-1");
  });

  it("returns null when slateId does not match", () => {
    const rotations = [
      { id: "r1", slateId: "slate-2", userId: "user-1", order: 0, intervalDays: 7, isActive: true },
    ];
    const result = getRotationForDate(rotations, "slate-1", new Date());
    expect(result).toBeNull();
  });

  it("ignores an invalid createdAt and anchors on the earliest valid one", () => {
    const base = new Date("2024-01-01");
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-a", order: 0, intervalDays: 7, isActive: true, createdAt: "not-a-date" },
      { id: "r2", slateId: "slate-1", userId: "user-b", order: 1, intervalDays: 7, isActive: true, createdAt: base.toISOString() },
    ];

    // Anchored on 2024-01-01: day 0 -> user-a, day 7 -> user-b.
    // If the invalid date were used, the day count would be NaN and no user returned.
    expect(getRotationForDate(rotations, "slate-1", base)).toBe("user-a");
    expect(getRotationForDate(rotations, "slate-1", new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000))).toBe("user-b");
  });

  it("respects intervalDays for rotation cycling — user-1 on first period", () => {
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-1", order: 0, intervalDays: 7, isActive: true },
      { id: "r2", slateId: "slate-1", userId: "user-2", order: 1, intervalDays: 7, isActive: true },
    ];

    const baseDate = new Date("2024-01-01");
    // First period — should get user-1 (cycle 0)
    const result1 = getRotationForDate(rotations, "slate-1", baseDate);
    expect(result1).toBe("user-1");

    // After 7 days (next rotation cycle) — should rotate to user-2
    const nextPeriod = new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const result2 = getRotationForDate(rotations, "slate-1", nextPeriod);
    expect(result2).toBe("user-2");

    // After 14 days from base — cycles back to user-1
    const thirdPeriod = new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const result3 = getRotationForDate(rotations, "slate-1", thirdPeriod);
    expect(result3).toBe("user-1");
  });

  it("uses the earliest createdAt when rotations have different start dates", () => {
    // Rotation B (user-b, order=1) has an EARLIER createdAt than rotation A (user-a, order=0)
    const base = new Date("2024-01-01");
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-a", order: 0, intervalDays: 7, isActive: true, createdAt: new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() },
      { id: "r2", slateId: "slate-1", userId: "user-b", order: 1, intervalDays: 7, isActive: true, createdAt: base.toISOString() },
    ];

    // Current code uses sorted[0].createdAt (day 7) as reference.
    // It should use the EARLIEST createdAt (day 0) instead.
    // With earliest=day 0: day 0→user-a(idx=0), day 7→user-b(idx=1), day 14→user-a(idx=0), etc.
    const day0 = base;
    const resultDay0 = getRotationForDate(rotations, "slate-1", day0);
    expect(resultDay0).toBe("user-a");

    const day7 = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
    const resultDay7 = getRotationForDate(rotations, "slate-1", day7);
    expect(resultDay7).toBe("user-b");

    const day14 = new Date(base.getTime() + 14 * 24 * 60 * 60 * 1000);
    const resultDay14 = getRotationForDate(rotations, "slate-1", day14);
    expect(resultDay14).toBe("user-a");

    const day21 = new Date(base.getTime() + 21 * 24 * 60 * 60 * 1000);
    const resultDay21 = getRotationForDate(rotations, "slate-1", day21);
    expect(resultDay21).toBe("user-b");
  });

  it("cycles through all active rotations based on days elapsed since earliest start date", () => {
    const base = new Date("2024-06-01");
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-a", order: 0, intervalDays: 7, isActive: true, createdAt: base.toISOString() },
      { id: "r2", slateId: "slate-1", userId: "user-b", order: 1, intervalDays: 7, isActive: true, createdAt: base.toISOString() },
    ];

    // Verify cycling with same createdAt for both rotations
    const results = [0, 7, 14, 21, 28, 35].map((days) =>
      getRotationForDate(rotations, "slate-1", new Date(base.getTime() + days * 24 * 60 * 60 * 1000))
    );

    expect(results).toEqual(["user-a", "user-b", "user-a", "user-b", "user-a", "user-b"]);
  });
});

describe("calculateRotationAssignment", () => {
  it("returns empty map when no slate tasks provided", () => {
    const result = calculateRotationAssignment([], [], new Date());
    expect(result.size).toBe(0);
  });

  it("returns empty map when no rotations provided", () => {
    const tasks = [{ id: "t1", slateId: "slate-1" }];
    const result = calculateRotationAssignment(tasks, [], new Date());
    expect(result.size).toBe(0);
  });

  it("assigns all slate tasks to the rotated user", () => {
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-1", order: 0, intervalDays: 7, isActive: true },
    ];
    const tasks = [{ id: "t1", slateId: "slate-1" }, { id: "t2", slateId: "slate-1" }];

    const result = calculateRotationAssignment(tasks, rotations, new Date());

    expect(result.has("user-1")).toBe(true);
    expect(result.get("user-1")).toContain("t1");
    expect(result.get("user-1")).toContain("t2");
  });

  it("assigns different tasks based on rotation period", () => {
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-1", order: 0, intervalDays: 7, isActive: true },
      { id: "r2", slateId: "slate-1", userId: "user-2", order: 1, intervalDays: 7, isActive: true },
    ];
    const tasks = [{ id: "t1", slateId: "slate-1" }];

    // Period 1 — user-1 gets the task
    const period1 = new Date("2024-01-01");
    const result1 = calculateRotationAssignment(tasks, rotations, period1);
    expect(result1.has("user-1")).toBe(true);
    expect(result1.get("user-1")).toContain("t1");

    // Period 2 — user-2 gets the task
    const period2 = new Date(period1.getTime() + 7 * 24 * 60 * 60 * 1000);
    const result2 = calculateRotationAssignment(tasks, rotations, period2);
    expect(result2.has("user-2")).toBe(true);
    expect(result2.get("user-2")).toContain("t1");
  });

  it("groups multiple slate tasks by assigned user", () => {
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-a", order: 0, intervalDays: 7, isActive: true },
    ];
    const tasks = [
      { id: "t1", slateId: "slate-1" },
      { id: "t2", slateId: "slate-1" },
      { id: "t3", slateId: "slate-1" },
    ];

    const result = calculateRotationAssignment(tasks, rotations, new Date());

    expect(result.size).toBe(1);
    expect(result.get("user-a")).toEqual(["t1", "t2", "t3"]);
  });

  it("handles multiple slateIds in rotation", () => {
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "u1", order: 0, intervalDays: 7, isActive: true },
      { id: "r2", slateId: "slate-2", userId: "u2", order: 0, intervalDays: 7, isActive: true },
    ];
    const tasks = [
      { id: "t1", slateId: "slate-1" },
      { id: "t2", slateId: "slate-2" },
    ];

    const result = calculateRotationAssignment(tasks, rotations, new Date());

    expect(result.size).toBe(2);
    expect(result.get("u1")).toContain("t1");
    expect(result.get("u2")).toContain("t2");
  });
});

describe("getRotationSchedule", () => {
  it("returns an empty array when no rotations exist", () => {
    const schedule = getRotationSchedule([], "slate-1", new Date(), new Date());
    expect(schedule).toEqual([]);
  });

  it("returns one entry per day in the range, all inside the same rotation period", () => {
    const base = new Date("2024-01-01");
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-a", order: 0, intervalDays: 7, isActive: true },
      { id: "r2", slateId: "slate-1", userId: "user-b", order: 1, intervalDays: 7, isActive: true },
    ];

    const schedule = getRotationSchedule(rotations, "slate-1", base, new Date(base.getTime() + 3 * 24 * 60 * 60 * 1000));

    // Jan 1-4 (4 days) and the epoch-anchored period has not flipped yet.
    expect(schedule).toHaveLength(4);
    expect(schedule.map((s) => s.userId)).toEqual(["user-a", "user-a", "user-a", "user-a"]);
    expect(schedule[0].date.toISOString().slice(0, 10)).toBe("2024-01-01");
    expect(schedule[3].date.toISOString().slice(0, 10)).toBe("2024-01-04");
  });

  it("keeps one user for the whole first 14-day interval", () => {
    const base = new Date("2024-01-01");
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-a", order: 0, intervalDays: 14, isActive: true },
      { id: "r2", slateId: "slate-1", userId: "user-b", order: 1, intervalDays: 14, isActive: true },
    ];

    const schedule = getRotationSchedule(rotations, "slate-1", base, new Date(base.getTime() + 5 * 24 * 60 * 60 * 1000));

    expect(schedule).toHaveLength(6);
    expect(schedule.every((s) => s.userId === "user-a")).toBe(true);
  });
});

describe("canSwapRotations", () => {
  it("returns true when both rotations exist and are on the same slate", () => {
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-a", order: 0, intervalDays: 7, isActive: true },
      { id: "r2", slateId: "slate-1", userId: "user-b", order: 1, intervalDays: 7, isActive: true },
    ];

    expect(canSwapRotations(rotations, "slate-1", "r1", "r2")).toBe(true);
  });

  it("returns false when rotation IDs don't exist", () => {
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-a", order: 0, intervalDays: 7, isActive: true },
      { id: "r2", slateId: "slate-1", userId: "user-b", order: 1, intervalDays: 7, isActive: true },
    ];

    expect(canSwapRotations(rotations, "slate-1", "r99", "r88")).toBe(false);
  });

  it("returns false when trying to swap with yourself", () => {
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-a", order: 0, intervalDays: 7, isActive: true },
    ];

    expect(canSwapRotations(rotations, "slate-1", "r1", "r1")).toBe(false);
  });

  it("returns true when rotations have different intervals", () => {
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-a", order: 0, intervalDays: 7, isActive: true },
      { id: "r2", slateId: "slate-1", userId: "user-b", order: 1, intervalDays: 14, isActive: true },
    ];

    expect(canSwapRotations(rotations, "slate-1", "r1", "r2")).toBe(true);
  });
});

describe("swapRotations", () => {
  it("swaps the order values of two rotations", () => {
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-a", order: 0, intervalDays: 7, isActive: true },
      { id: "r2", slateId: "slate-1", userId: "user-b", order: 1, intervalDays: 7, isActive: true },
    ];

    const swapped = swapRotations(rotations, "slate-1", "r1", "r2");

    expect(swapped[0].order).toBe(1);
    expect(swapped[1].order).toBe(0);
  });

  it("does not modify rotations when IDs don't exist", () => {
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-a", order: 0, intervalDays: 7, isActive: true },
      { id: "r2", slateId: "slate-1", userId: "user-b", order: 1, intervalDays: 7, isActive: true },
    ];

    const swapped = swapRotations(rotations, "slate-1", "r99", "r88");

    expect(swapped[0].order).toBe(0);
    expect(swapped[1].order).toBe(1);
  });

  it("preserves other rotation entries when swapping", () => {
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-a", order: 0, intervalDays: 7, isActive: true },
      { id: "r2", slateId: "slate-1", userId: "user-b", order: 1, intervalDays: 7, isActive: true },
      { id: "r3", slateId: "slate-2", userId: "user-c", order: 0, intervalDays: 7, isActive: true },
    ];

    const swapped = swapRotations(rotations, "slate-1", "r1", "r2");

    expect(swapped[2].order).toBe(0); // Unchanged slate-2 rotation
    expect(swapped[2].userId).toBe("user-c");
  });
});

describe("getUpcomingAssignments", () => {
  it("returns assignments for the given date range", () => {
    const base = new Date("2024-01-01");
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-a", order: 0, intervalDays: 7, isActive: true },
      { id: "r2", slateId: "slate-1", userId: "user-b", order: 1, intervalDays: 7, isActive: true },
    ];

    const assignments = getUpcomingAssignments(rotations, "slate-1", base, 7);

    expect(assignments.length).toBe(8);
    expect(assignments.every((a) => a.userId === "user-a" || a.userId === "user-b")).toBe(true);
    // First assignment should be user-a (start of cycle)
    expect(assignments[0].userId).toBe("user-a");
  });

  it("returns an empty array when no rotations exist", () => {
    const assignments = getUpcomingAssignments([], "slate-1", new Date(), 30);
    expect(assignments).toEqual([]);
  });
});
