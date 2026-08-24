import { describe, it, expect } from "vitest";
import {
  VALID_TRANSITIONS,
  canTransition,
  getValidNextStatuses,
  calculateJobPoints,
} from "./jobStatus";

describe("VALID_TRANSITIONS", () => {
  it("defines all expected status keys", () => {
    expect(VALID_TRANSITIONS).toHaveProperty("todo");
    expect(VALID_TRANSITIONS).toHaveProperty("doing");
    expect(VALID_TRANSITIONS).toHaveProperty("done");
  });

  it("allows todo -> doing transition", () => {
    expect(VALID_TRANSITIONS.todo).toContain("doing");
  });

  it("allows doing -> done and doing -> todo transitions", () => {
    expect(VALID_TRANSITIONS.doing).toContain("done");
    expect(VALID_TRANSITIONS.doing).toContain("todo");
  });

  it("blocks all transitions from done (terminal state)", () => {
    expect(VALID_TRANSITIONS.done).toEqual([]);
  });
});

describe("canTransition", () => {
  it("returns true for valid todo -> doing transition", () => {
    expect(canTransition("todo", "doing")).toBe(true);
  });

  it("returns true for valid doing -> done transition", () => {
    expect(canTransition("doing", "done")).toBe(true);
  });

  it("returns true for valid doing -> todo transition", () => {
    expect(canTransition("doing", "todo")).toBe(true);
  });

  it("returns false for invalid todo -> done transition (must go through doing)", () => {
    expect(canTransition("todo", "done")).toBe(false);
  });

  it("returns false for invalid todo -> todo self-transition", () => {
    expect(canTransition("todo", "todo")).toBe(false);
  });

  it("returns false for invalid doing -> doing self-transition", () => {
    expect(canTransition("doing", "doing")).toBe(false);
  });

  it("returns false for any transition from done (terminal state)", () => {
    expect(canTransition("done", "todo")).toBe(false);
    expect(canTransition("done", "doing")).toBe(false);
    expect(canTransition("done", "done")).toBe(false);
  });

  it("returns false for unknown status", () => {
    expect(canTransition("unknown", "todo")).toBe(false);
    expect(canTransition("", "todo")).toBe(false);
  });

  it("returns false for unknown newStatus even if oldStatus is valid", () => {
    expect(canTransition("todo", "invalid")).toBe(false);
  });
});

describe("getValidNextStatuses", () => {
  it("returns ['doing'] for todo status", () => {
    expect(getValidNextStatuses("todo")).toEqual(["doing"]);
  });

  it("returns ['todo', 'done', 'under_review'] for doing status", () => {
    expect(getValidNextStatuses("doing")).toEqual(["todo", "done", "under_review"]);
  });

  it("returns empty array for done status", () => {
    expect(getValidNextStatuses("done")).toEqual([]);
  });

  it("returns empty array for unknown status", () => {
    expect(getValidNextStatuses("unknown")).toEqual([]);
  });

  it("handles undefined input", () => {
    expect(getValidNextStatuses(undefined as any)).toEqual([]);
  });
});

describe("calculateJobPoints", () => {
  it("returns job points when no subtasks provided", () => {
    const job = { points: 10 };
    expect(calculateJobPoints(job)).toBe(10);
  });

  it("adds completed subtask points to total", () => {
    const job = { points: 5 };
    const subtasks = [
      { completedAt: new Date(), pointsAwarded: 3 },
      { completedAt: null, pointsAwarded: 2 },
    ];
    expect(calculateJobPoints(job, subtasks)).toBe(8); // 5 + 3 (only completed)
  });

  it("returns 0 for job with no points", () => {
    const job = { points: 0 };
    expect(calculateJobPoints(job)).toBe(0);
  });

  it("handles null/undefined subtasks gracefully", () => {
    expect(calculateJobPoints({ points: 5 }, undefined)).toBe(5);
    expect(calculateJobPoints({})).toBe(0);
  });

  it("adds all completed subtask points when all are completed", () => {
    const job = { points: 10 };
    const subtasks = [
      { completedAt: new Date(), pointsAwarded: 3 },
      { completedAt: new Date(), pointsAwarded: 2 },
      { completedAt: new Date(), pointsAwarded: 1 },
    ];
    expect(calculateJobPoints(job, subtasks)).toBe(16); // 10 + 3 + 2 + 1
  });

  it("skips uncompleted subtasks", () => {
    const job = { points: 10 };
    const subtasks = [
      { completedAt: null, pointsAwarded: 5 },
      { completedAt: new Date(), pointsAwarded: 3 },
    ];
    expect(calculateJobPoints(job, subtasks)).toBe(13); // 10 + 0 + 3
  });

  it("falls back to subtask.points when pointsAwarded is missing", () => {
    const job = { points: 5 };
    const subtasks = [
      { completedAt: new Date(), pointsAwarded: null, points: 4 },
    ];
    expect(calculateJobPoints(job, subtasks)).toBe(9); // 5 + 4
  });

  it("handles empty job object", () => {
    const job = {};
    expect(calculateJobPoints(job, [])).toBe(0);
  });
});
