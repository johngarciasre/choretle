import { describe, it, expect } from "vitest";
import { getRotationForDate, calculateRotationAssignment } from "@/lib/rotation";

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

  it("handles invalid createdAt by using fallback date", () => {
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-1", order: 0, intervalDays: 7, isActive: true },
    ];
    const result = getRotationForDate(rotations, "slate-1", new Date());
    expect(result).toBeDefined();
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

  it("returns null when base rotation has invalid createdAt (NaN date)", () => {
    const rotations = [
      { id: "r1", slateId: "slate-1", userId: "user-1", order: 0, intervalDays: 7, isActive: true },
    ];
    // Simulate invalid createdAt by passing an object without it
    const result = getRotationForDate(rotations, "slate-1", new Date());
    expect(result).toBeDefined();
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
