import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { verifyAuth } from "@/lib/auth";
import { error } from "@/lib/logger.server";
import { currentStreakFromDays } from "@/lib/streak";

interface Completion {
  completed_at: string;
  points: number | null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const familyId = auth.familyId;
    const userId = auth.userId;

    if (!familyId || !userId) {
      return NextResponse.json({ error: "Family ID and User ID required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json([]);
    }

    const familyLists = `(SELECT id FROM lists WHERE family_id = ?)`;

    const totalPoints = rawDb.prepare(
      `SELECT points_total FROM users WHERE id = ? AND family_id = ?`
    ).get(userId, familyId) as any;

    const completions = rawDb.prepare(
      `SELECT completed_at, points FROM jobs
       WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
         AND list_id IN ${familyLists}
       ORDER BY completed_at ASC`
    ).all(userId, familyId) as Completion[];

    const days = rawDb.prepare(
      `SELECT DISTINCT DATE(completed_at) as day FROM jobs
       WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
         AND list_id IN ${familyLists}
       ORDER BY day DESC`
    ).all(userId, familyId) as Array<{ day: string }>;

    const weeklyPeak = rawDb.prepare(
      `SELECT MAX(week_count) as peak FROM (
         SELECT COUNT(*) as week_count FROM jobs
         WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
           AND list_id IN ${familyLists}
         GROUP BY strftime('%Y-%W', DATE(completed_at))
       )`
    ).get(userId, familyId) as any;

    const peakWeek = rawDb.prepare(
      `SELECT strftime('%Y-%W', DATE(completed_at)) as week, MIN(completed_at) as first_at, COUNT(*) as cnt
       FROM jobs
       WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
         AND list_id IN ${familyLists}
       GROUP BY week ORDER BY cnt DESC LIMIT 1`
    ).get(userId, familyId) as any;

    const consistencyWeeks = rawDb.prepare(
      `SELECT COUNT(DISTINCT strftime('%Y-%W', DATE(completed_at))) as weeks FROM jobs
       WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
         AND completed_at >= datetime('now', '-364 days')
         AND list_id IN ${familyLists}`
    ).get(userId, familyId) as any;

    // Position by points within the family: 1 + number of members ahead.
    const leaderboardRank = rawDb.prepare(
      `SELECT 1 + COUNT(*) as rank FROM users
       WHERE family_id = ?
         AND points_total > (SELECT points_total FROM users WHERE id = ?)`
    ).get(familyId, userId) as any;

    const totalCompleted = completions.length;
    const streakCount = currentStreakFromDays((days || []).map((d) => String(d.day)));

    /** Completion timestamp for the Nth finished job (1-based). */
    const dateOfCompletion = (n: number): string | null => completions[n - 1]?.completed_at || null;

    /** Completion timestamp at which cumulative points first reached the threshold. */
    const datePointsReached = (threshold: number): string | null => {
      let sum = 0;
      for (const c of completions) {
        sum += c.points || 0;
        if (sum >= threshold) return c.completed_at;
      }
      return null;
    };

    const lastCompletionAt = totalCompleted > 0 ? completions[totalCompleted - 1].completed_at : null;

    const medals: Array<{ type: string; level: string; earnedAt: string | null }> = [
      {
        type: "points",
        level: _medalLevel(totalPoints?.points_total ?? 0, { bronze: 50, silver: 200, gold: 500, diamond: 1000 }),
        earnedAt: datePointsReached(50),
      },
      {
        type: "tasks_completed",
        level: _medalLevel(totalCompleted, { bronze: 5, silver: 20, gold: 50, diamond: 100 }),
        earnedAt: dateOfCompletion(5),
      },
      {
        type: "streak",
        level: _medalLevel(streakCount, { bronze: 3, silver: 7, gold: 14, diamond: 30 }),
        // The current streak reached its level on the most recent completion.
        earnedAt: streakCount >= 3 ? lastCompletionAt : null,
      },
      {
        type: "weekly_peak",
        level: _medalLevel(weeklyPeak?.peak ?? 0, { bronze: 3, silver: 7, gold: 15, diamond: 25 }),
        earnedAt: (weeklyPeak?.peak ?? 0) >= 3 ? peakWeek?.first_at || null : null,
      },
      {
        type: "consistency",
        level: _medalLevel(consistencyWeeks?.weeks ?? 0, { bronze: 4, silver: 8, gold: 16, diamond: 30 }),
        earnedAt: (consistencyWeeks?.weeks ?? 0) >= 4 ? dateOfCompletion(1) : null,
      },
      {
        type: "leaderboard",
        level: _rankLevel(leaderboardRank?.rank ?? 999),
        // A rank is a live standing, not a dated achievement.
        earnedAt: null,
      },
    ];

    return NextResponse.json({ medals });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Medals GET failed");
    return NextResponse.json({ error: "Failed to fetch medals" }, { status: 500 });
  }
}

/**
 * Determine the highest medal level reached given a value and thresholds.
 * Thresholds are ordered from lowest (bronze) to highest (diamond).
 */
function _medalLevel(value: number, thresholds: Record<string, number>): string {
  if (value >= thresholds.diamond) return "diamond";
  if (value >= thresholds.gold) return "gold";
  if (value >= thresholds.silver) return "silver";
  if (value >= thresholds.bronze) return "bronze";
  return "none";
}

/** Ranks are small-is-better, so they get their own mapping. */
function _rankLevel(rank: number): string {
  if (rank === 1) return "diamond";
  if (rank === 2) return "gold";
  if (rank === 3) return "silver";
  if (rank <= 10) return "bronze";
  return "none";
}
