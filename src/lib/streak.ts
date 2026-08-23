export function calculateStreak(completedJobs: Array<{ completedAt?: string }>): number {
  if (completedJobs.length === 0) return 0;

  const sorted = [...completedJobs].sort((a, b) =>
    new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
  );

  let streak = 0;
  let lastDate: Date | null = null;

  for (const job of sorted) {
    if (!job.completedAt) continue;
    const date = new Date(job.completedAt);

    if (!lastDate) {
      lastDate = date;
      continue;
    }

    const diffTime = Math.abs(lastDate.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      streak++;
      lastDate = date;
    } else if (diffDays > 1 && diffDays <= 3) {
      streak = 1;
      lastDate = date;
    } else {
      break;
    }
  }

  return streak;
}

export function calculateLongestStreak(completedJobs: Array<{ completedAt?: string }>): number {
  if (completedJobs.length === 0) return 0;

  const sorted = [...completedJobs].sort((a, b) =>
    new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
  );

  let longestStreak = 0;
  let currentStreak = 0;
  let lastDate: Date | null = null;

  for (const job of sorted) {
    if (!job.completedAt) continue;
    const date = new Date(job.completedAt);

    if (!lastDate) {
      lastDate = date;
      currentStreak++;
      continue;
    }

    const diffTime = Math.abs(lastDate.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      currentStreak++;
      lastDate = date;
    } else if (diffDays > 1 && diffDays <= 3) {
      longestStreak = Math.max(longestStreak, currentStreak);
      currentStreak = 1;
      lastDate = date;
    } else {
      longestStreak = Math.max(longestStreak, currentStreak);
      break;
    }
  }

  return Math.max(longestStreak, currentStreak);
}

export function calculatePointsThisWeek(
  completedJobs: Array<{ completedAt?: string; points?: number }>
): number {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return completedJobs
    .filter((job) => job.completedAt && new Date(job.completedAt) > oneWeekAgo)
    .reduce((sum, job) => sum + (job.points || 0), 0);
}

export function calculatePointsLastWeek(
  completedJobs: Array<{ completedAt?: string; points?: number }>
): number {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return completedJobs
    .filter((job) => {
      if (!job.completedAt) return false;
      const date = new Date(job.completedAt);
      return date > fourteenDaysAgo && date <= oneWeekAgo;
    })
    .reduce((sum, job) => sum + (job.points || 0), 0);
}
