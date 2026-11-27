import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
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

    const householdId = auth.householdId;
    const userId = auth.userId;

    if (!householdId || !userId) {
      return NextResponse.json({ error: "Household ID and User ID required" }, { status: 400 });
    }

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json([]);
    }

    const householdLists = `(SELECT id FROM lists WHERE household_id = ?)`;

    const totalPoints = await rawDb.prepare(
      `SELECT points_total FROM memberships WHERE user_id = ? AND household_id = ?`
    ).get(userId, householdId) as any;

    const completions = await rawDb.prepare(
      `SELECT completed_at, points FROM jobs
       WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
         AND list_id IN ${householdLists}
       ORDER BY completed_at ASC`
    ).all(userId, householdId) as Completion[];

    const days = await rawDb.prepare(
      `SELECT DISTINCT to_char(completed_at, 'YYYY-MM-DD') as day FROM jobs
       WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
         AND list_id IN ${householdLists}
       ORDER BY day DESC`
    ).all(userId, householdId) as Array<{ day: string }>;

    const weeklyPeak = await rawDb.prepare(
      `SELECT MAX(week_count) as peak FROM (
         SELECT COUNT(*) as week_count FROM jobs
         WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
           AND list_id IN ${householdLists}
         GROUP BY to_char(completed_at, 'IYYY-IW')
       )`
    ).get(userId, householdId) as any;

    const peakWeek = await rawDb.prepare(
      `SELECT to_char(completed_at, 'IYYY-IW') as week, MIN(completed_at) as first_at, COUNT(*) as cnt
       FROM jobs
       WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
         AND list_id IN ${householdLists}
       GROUP BY week ORDER BY cnt DESC LIMIT 1`
    ).get(userId, householdId) as any;

    const consistencyWeeks = await rawDb.prepare(
      `SELECT COUNT(DISTINCT to_char(completed_at, 'IYYY-IW')) as weeks FROM jobs
       WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
         AND completed_at >= now() - interval '364 days'
         AND list_id IN ${householdLists}`
    ).get(userId, householdId) as any;

    // Position by points within the household: 1 + number of members ahead.
    const leaderboardRank = await rawDb.prepare(
      `SELECT 1 + COUNT(*) as rank FROM memberships
       WHERE household_id = ?
         AND points_total > (SELECT points_total FROM memberships WHERE user_id = ?)`
    ).get(householdId, userId) as any;

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
