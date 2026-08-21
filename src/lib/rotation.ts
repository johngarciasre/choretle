// ─── Pure Functions: Rotation Assignment ──────────────────────────────

export function getRotationForDate(
  rotations: any[],
  slateId: string,
  date: Date,
): string | null {
  const activeRotations = rotations.filter((r) => r.slateId === slateId && r.isActive);

  if (activeRotations.length === 0) return null;

  // Sort by order to get the "base" rotation (the one that starts the cycle)
  const sorted = [...activeRotations].sort((a, b) => a.order - b.order);
  const baseRotation = sorted[0];

  // Use createdAt if available, otherwise use a fixed epoch start for deterministic results
  const start = baseRotation.createdAt
    ? new Date(baseRotation.createdAt)
    : new Date("2000-01-01");
  if (isNaN(start.getTime())) return null;

  const diffMs = date.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Use intervalDays to determine which rotation entry applies
  const effectiveInterval = baseRotation.intervalDays || 7;
  const entriesPerCycle = Math.max(1, activeRotations.length);

  // Count how many full rotation cycles have passed since start
  const cyclesPassed = Math.floor(diffDays / effectiveInterval);
  const idx = cyclesPassed % entriesPerCycle;

  return activeRotations[idx]?.userId || null;
}

export function calculateRotationAssignment(
  slateTasks: any[],
  rotations: any[],
  targetDate: Date,
): Map<string, string[]> {
  // Build slateId -> task lookup
  const slateTaskMap = new Map<string, any[]>();
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
