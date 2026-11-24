/**
 * Streaks are consecutive calendar days with at least one completed job.
 * A streak stays "current" if it was last extended today or yesterday, so a
 * day that is still in progress does not erase it.
 */
function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function currentStreakFromDays(days: Iterable<string>, today: Date = new Date()): number {
  const set = new Set(Array.from(days, (d) => d.slice(0, 10)));
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  if (!set.has(toDayKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;
  while (set.has(toDayKey(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
