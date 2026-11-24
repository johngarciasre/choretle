/**
 * Maps GET /api/profile/[id] into the view model the profile page renders.
 *
 * The route returns raw rows (user + completedJobs); the page needs totals,
 * week-over-week points and a per-completion list. Keeping that arithmetic here
 * makes it testable without a browser.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ProfileApiResponse {
  user?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
    avatarUrl?: string | null;
    pointsTotal?: number;
    streakCount?: number;
    createdAt?: string | null;
  } | null;
  completedJobs?: Array<{
    id: string;
    name: string;
    taskName?: string | null;
    points?: number | null;
    completedAt?: string | null;
  }> | null;
}

export interface ProfileUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: string;
  pointsTotal: number;
  createdAt: string;
}

export interface ProfileStats {
  totalPoints: number;
  pointsThisWeek: number;
  pointsLastWeek: number;
  jobsCompleted: number;
  averagePointsPerJob: number;
  streakDays: number;
  longestStreak: number;
}

export interface ProfileCompletion {
  id: string;
  name: string;
  points: number;
  completedAt: string;
  category: string;
  taskName?: string | null;
}

/** Longest run of consecutive calendar days in a set of YYYY-MM-DD strings. */
export function longestStreakFromDays(days: string[]): number {
  const unique = [...new Set(days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  let best = 0;
  let run = 0;
  let previous: number | null = null;

  for (const day of unique) {
    const time = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
    run = previous !== null && time - previous === DAY_MS ? run + 1 : 1;
    best = Math.max(best, run);
    previous = time;
  }

  return best;
}

export function buildProfileView(
  data: ProfileApiResponse,
  nowMs: number,
): { user: ProfileUser; stats: ProfileStats; completions: ProfileCompletion[] } {
  const user: ProfileUser = {
    id: data.user?.id ?? "",
    name: data.user?.name ?? "",
    email: data.user?.email ?? "",
    avatarUrl: data.user?.avatarUrl ?? undefined,
    role: data.user?.role ?? "child",
    pointsTotal: data.user?.pointsTotal ?? 0,
    createdAt: data.user?.createdAt ?? "",
  };

  const completions: ProfileCompletion[] = (data.completedJobs ?? []).map((job) => ({
    id: job.id,
    name: job.name,
    points: job.points ?? 0,
    completedAt: job.completedAt ?? "",
    category: job.taskName || job.name || "Other",
    taskName: job.taskName ?? null,
  }));

  let pointsThisWeek = 0;
  let pointsLastWeek = 0;
  for (const completion of completions) {
    const time = Date.parse(completion.completedAt);
    if (!Number.isFinite(time)) continue;
    if (time >= nowMs - 7 * DAY_MS) pointsThisWeek += completion.points;
    else if (time >= nowMs - 14 * DAY_MS) pointsLastWeek += completion.points;
  }

  const jobsCompleted = completions.length;
  const stats: ProfileStats = {
    totalPoints: user.pointsTotal,
    pointsThisWeek,
    pointsLastWeek,
    jobsCompleted,
    averagePointsPerJob: jobsCompleted > 0 ? Math.round((user.pointsTotal / jobsCompleted) * 10) / 10 : 0,
    streakDays: data.user?.streakCount ?? 0,
    longestStreak: longestStreakFromDays(completions.map((c) => c.completedAt.slice(0, 10))),
  };

  return { user, stats, completions };
}
