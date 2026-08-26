// ─── Pure Functions: Point Calculation & Slate Generation ─────────────

interface Subtask {
  completedAt?: string | Date | null;
  pointsAwarded?: number;
  points?: number;
}

interface JobLike {
  points?: number;
}

interface Slate {
  id?: string;
  isActive: boolean;
  createdAt?: string | Date;
  frequency?: string;
  interval?: number;
}

/**
 * Calculate points to award when a job is completed.
 * Starts with job.points, adds/subtracts for subtask completions.
 */
export function calculatePoints(job: JobLike, subtasks?: Subtask[]): number {
  let total = job?.points || 0;

  if (subtasks && subtasks.length > 0) {
    for (const subtask of subtasks) {
      if (subtask.completedAt) {
        total += subtask.pointsAwarded || subtask.points || 0;
      }
    }
  }

  return total;
}

/**
 * Calculate the effective interval in days from a slate's frequency + interval.
 * daily=1, weekly=7, biweekly=14, monthly=30
 */
export function getFrequencyDays(frequency: string, interval: number): number {
  const baseMap: Record<string, number> = {
    daily: 1,
    weekly: 7,
    biweekly: 14,
    monthly: 30,
  };

  const base = baseMap[frequency] || 7; // default to weekly
  return base * interval;
}

/**
 * Check if a slate should generate a list for the given date.
 * A slate generates when (date - createdAt).days % frequencyDays === 0
 */
export function shouldGenerateList(slate: Slate, targetDate: Date): boolean {
  if (!slate.isActive) return false;

  if (!slate.createdAt) return true; // No creation date — assume eligible
  const created = new Date(slate.createdAt);
  if (isNaN(created.getTime())) return false;

  const diffMs = targetDate.getTime() - created.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return false;

  const frequencyDays = getFrequencyDays(slate.frequency || "weekly", slate.interval || 1);

  return diffDays % frequencyDays === 0;
}

/**
 * Filter slates that need to generate lists for a given date.
 */
export function findActiveSlatesForDate(slates: Slate[], targetDate: Date): Slate[] {
  return slates.filter((slate) => shouldGenerateList(slate, targetDate));
}
