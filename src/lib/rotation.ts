// ─── Pure Functions: Rotation Assignment ──────────────────────────────

interface Rotation {
  id: string;
  slateId: string;
  userId?: string;
  order: number;
  intervalDays?: number;
  isActive: boolean;
  createdAt?: string | Date;
}

interface SlateTask {
  id: string;
  slateId: string;
}

/**
 * Get the user assigned to a slate on a specific date.
 * Each slate has its own rotation schedule based on active rotations.
 */
export function getRotationForDate(
  rotations: Rotation[],
  slateId: string,
  date: Date,
): string | null {
  const activeRotations = rotations.filter((r) => r.slateId === slateId && r.isActive);

  if (activeRotations.length === 0) return null;

  // Sort by order so entries are in the correct cycling sequence
  const sorted = [...activeRotations].sort((a, b) => a.order - b.order);

  // Use the earliest createdAt across all active rotations as the reference point
  let earliestStart: Date | null = null;
  for (const r of sorted) {
    if (r.createdAt) {
      const d = new Date(r.createdAt);
      if (!isNaN(d.getTime())) {
        if (!earliestStart || d.getTime() < earliestStart.getTime()) {
          earliestStart = d;
        }
      }
    }
  }

  // Fall back to the epoch date (2000-01-01) if no valid createdAt found anywhere
  const start = earliestStart || new Date("2000-01-01");

  const diffMs = date.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Use intervalDays to determine which rotation entry applies
  const effectiveInterval = sorted[0].intervalDays || 7;
  const entriesPerCycle = sorted.length;

  // Count how many full rotation cycles have passed since start
  const cyclesPassed = Math.floor(diffDays / effectiveInterval);
  const idx = cyclesPassed % entriesPerCycle;

  return sorted[idx]?.userId || null;
}

/**
 * Calculate all assignments for a slate on the given date.
 * Returns a map of userId -> [taskIds] where each user gets their rotation-based tasks.
 */
export function calculateRotationAssignment(
  slateTasks: SlateTask[],
  rotations: Rotation[],
  targetDate: Date,
): Map<string, string[]> {
  // Build slateId -> task lookup
  const slateTaskMap = new Map<string, SlateTask[]>();
  for (const st of slateTasks) {
    if (!slateTaskMap.has(st.slateId)) {
      slateTaskMap.set(st.slateId, []);
    }
    slateTaskMap.get(st.slateId)!.push(st);
  }

  // Collect unique slateIds from rotations
  const slateIds = [...new Set(rotations.map((r) => r.slateId))];

  // userId -> [taskIds]
  const assignment: Map<string, string[]> = new Map();

  for (const slateId of slateIds) {
    const tasksForSlate = slateTaskMap.get(slateId) || [];
    if (tasksForSlate.length === 0) continue;

    const userId = getRotationForDate(rotations, slateId, targetDate);
    if (!userId) continue;

    if (!assignment.has(userId)) {
      assignment.set(userId, []);
    }

    for (const task of tasksForSlate) {
      assignment.get(userId)!.push(task.id);
    }
  }

  return assignment;
}

/**
 * Get the full rotation schedule for a slate over a date range.
 * Returns an array of { date, userId } entries showing who's assigned on each day.
 */
export function getRotationSchedule(
  rotations: Rotation[],
  slateId: string,
  startDate: Date,
  endDate: Date,
): Array<{ date: Date; userId: string }> {
  const activeRotations = rotations.filter((r) => r.slateId === slateId && r.isActive);

  if (activeRotations.length === 0) return [];

  const sorted = [...activeRotations].sort((a, b) => a.order - b.order);
  const intervalDays = sorted[0].intervalDays || 7;

  const schedule: Array<{ date: Date; userId: string }> = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const userId = getRotationForDate(rotations, slateId, current);
    if (userId) {
      schedule.push({ date: new Date(current), userId });
    }
    current.setDate(current.getDate() + 1);
  }

  return schedule;
}

/**
 * Swap two rotation entries between users on the same slate.
 * Returns true if the swap was valid, false otherwise.
 */
export function canSwapRotations(
  rotations: Rotation[],
  slateId: string,
  rotationId1: string,
  rotationId2: string,
): boolean {
  const active = rotations.filter((r) => r.slateId === slateId && r.isActive);
  const swap1 = active.find((r) => r.id === rotationId1);
  const swap2 = active.find((r) => r.id === rotationId2);

  if (!swap1 || !swap2) return false;
  if (swap1.userId === swap2.userId) return false; // Can't swap with yourself
  if (swap1.intervalDays !== swap2.intervalDays) return true; // Different intervals allowed
  return true;
}

/**
 * Swap two rotation entries and return the updated rotations array.
 */
export function swapRotations(
  rotations: Rotation[],
  slateId: string,
  rotationId1: string,
  rotationId2: string,
): Rotation[] {
  const active = rotations.filter((r) => r.slateId === slateId && r.isActive);
  const swap1Index = active.findIndex((r) => r.id === rotationId1);
  const swap2Index = active.findIndex((r) => r.id === rotationId2);

  if (swap1Index < 0 || swap2Index < 0) return rotations;

  // Swap the order values
  const tempOrder = active[swap1Index].order;
  active[swap1Index].order = active[swap2Index].order;
  active[swap2Index].order = tempOrder;

  // Merge changes back into the original array
  return rotations.map((r) => {
    if (r.id === rotationId1 || r.id === rotationId2) {
      return { ...r, order: active.find((a) => a.id === r.id)?.order ?? r.order };
    }
    return r;
  });
}

/**
 * Calculate the next rotation dates for all users on a slate.
 * Useful for displaying upcoming assignments.
 */
export function getUpcomingAssignments(
  rotations: Rotation[],
  slateId: string,
  startDate: Date,
  daysAhead: number = 30,
): Array<{ date: Date; userId: string; isCurrent: boolean }> {
  const schedule = getRotationSchedule(rotations, slateId, startDate, new Date(startDate.getTime() + daysAhead * 24 * 60 * 60 * 1000));
  const today = new Date();

  return schedule.map(({ date, userId }) => ({
    date,
    userId,
    isCurrent: date.toDateString() === today.toDateString(),
  }));
}
