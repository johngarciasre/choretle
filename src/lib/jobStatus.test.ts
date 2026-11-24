import { describe, it, expect } from "vitest";
import { VALID_TRANSITIONS, canTransition, getValidNextStatuses } from "./jobStatus";

describe("job status transitions", () => {
  it("allows the moves both UIs perform", () => {
    expect(canTransition("todo", "doing")).toBe(true);
    expect(canTransition("todo", "done")).toBe(true); // kanban drag straight to done
    expect(canTransition("doing", "todo")).toBe(true);
    expect(canTransition("doing", "done")).toBe(true);
    expect(canTransition("doing", "under_review")).toBe(true);
    expect(canTransition("under_review", "doing")).toBe(true);
    expect(canTransition("under_review", "done")).toBe(true);
  });

  it("treats done as terminal so points cannot be paid twice", () => {
    expect(VALID_TRANSITIONS.done).toEqual([]);
    expect(canTransition("done", "todo")).toBe(false);
    expect(canTransition("done", "doing")).toBe(false);
    expect(canTransition("done", "done")).toBe(false);
  });

  it("rejects self-transitions and unknown values", () => {
    expect(canTransition("todo", "todo")).toBe(false);
    expect(canTransition("doing", "doing")).toBe(false);
    expect(canTransition("banana", "done")).toBe(false);
    expect(getValidNextStatuses("banana")).toEqual([]);
  });
});
