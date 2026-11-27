// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { columnFor } from "@/components/KanbanBoard";
import { canTransition } from "@/lib/jobStatus";

/** Mirrors the board's first guard in moveJob. */
const landsOnItsOwnColumn = (status: string, target: string) => columnFor(status) === target;

describe("kanban drop rules", () => {
  it("keeps a submitted chore in the In Progress column", () => {
    expect(columnFor("under_review")).toBe("doing");
  });

  it("treats a drop on the card's own column as nothing", () => {
    expect(landsOnItsOwnColumn("under_review", "doing")).toBe(true); // must not withdraw the review
    expect(landsOnItsOwnColumn("todo", "todo")).toBe(true);
    expect(landsOnItsOwnColumn("todo", "doing")).toBe(false);
  });

  it("never asks the server to reopen a finished chore", () => {
    // Done cards are not draggable, and the guard blocks a stale drop too.
    expect(canTransition("done", "doing")).toBe(false);
    expect(canTransition("done", "todo")).toBe(false);
  });
});
