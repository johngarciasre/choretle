// ─── Job Status Transition Rules ─────────────────────────────────────
// One table for every writer (job detail page and the kanban board).
// "done" is terminal so points cannot be earned twice for the same job.

export const VALID_TRANSITIONS: Record<string, string[]> = {
  todo: ["doing", "done"],
  doing: ["todo", "done", "under_review"],
  under_review: ["doing", "done"],
  done: [],
};

export function canTransition(status: string, newStatus: string): boolean {
  return VALID_TRANSITIONS[status]?.includes(newStatus) ?? false;
}

export function getValidNextStatuses(status: string): string[] {
  return VALID_TRANSITIONS[status] ?? [];
}
