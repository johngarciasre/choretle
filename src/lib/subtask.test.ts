import { describe, it, expect } from "vitest";
import { isPending, getPendingCount } from "./subtask";

describe("isPending", () => {
  it("returns true for a subtask with no completedAt", () => {
    const subtask = { id: "1", completedAt: null };
    expect(isPending(subtask as any)).toBe(true);
  });

  it("returns false for a subtask with completedAt set", () => {
    const subtask = { id: "1", completedAt: new Date() };
    expect(isPending(subtask as any)).toBe(false);
  });

  it("handles null/undefined subtasks gracefully", () => {
    expect(isPending(null as any)).toBe(false);
    expect(isPending(undefined as any)).toBe(false);
  });
});

describe("getPendingCount", () => {
  it("returns 0 for empty array", () => {
    expect(getPendingCount([])).toBe(0);
  });

  it("returns 0 for null/undefined input", () => {
    expect(getPendingCount(null as any)).toBe(0);
    expect(getPendingCount(undefined as any)).toBe(0);
  });

  it("returns correct count of pending subtasks", () => {
    const subtasks = [
      { completedAt: null },
      { completedAt: new Date() },
      { completedAt: null },
      { completedAt: null },
    ];
    expect(getPendingCount(subtasks as any)).toBe(3); // 3 pending, 1 completed
  });

  it("returns 0 when all subtasks are completed", () => {
    const subtasks = [
      { completedAt: new Date() },
      { completedAt: new Date() },
    ];
    expect(getPendingCount(subtasks as any)).toBe(0);
  });

  it("returns total count when none are completed", () => {
    const subtasks = [
      { completedAt: null },
      { completedAt: null },
      { completedAt: null },
    ];
    expect(getPendingCount(subtasks as any)).toBe(3);
  });

  it("handles mixed completed and pending correctly", () => {
    const subtasks = [
      { id: "1", completedAt: new Date(), pointsAwarded: 5 },
      { id: "2", completedAt: null, pointsAwarded: 3 },
      { id: "3", completedAt: null, pointsAwarded: 2 },
      { id: "4", completedAt: new Date(), pointsAwarded: 1 },
    ];
    expect(getPendingCount(subtasks as any)).toBe(2); // IDs 2 and 3 are pending
  });

  it("handles undefined input gracefully", () => {
    expect(getPendingCount(undefined as any)).toBe(0);
  });
});
