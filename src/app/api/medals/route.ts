import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { verifyAuth } from "@/lib/auth";
import { error } from "@/lib/logger.server";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const familyId = auth.familyId;
    const userId = auth.userId || request.headers.get("x-user-id") || "";

    if (!familyId || !userId) {
      return NextResponse.json({ error: "Family ID and User ID required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json([]);
    }

    // ─── Fetch user stats needed for medal calculations ──────────────

    // Total points
    const totalPoints = rawDb.prepare(
      `SELECT points_total FROM users WHERE id = ?`
    ).get(userId) as any;

    // Total completed jobs
    const totalCompleted = rawDb.prepare(`
      SELECT COUNT(*) as cnt FROM jobs
      WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
    `).get(userId) as any;

    // Current streak (consecutive days with ≥1 done job)
    const streakCount = rawDb.prepare(`
      SELECT COUNT(*) as streak FROM (
        SELECT DATE(completed_at) as day
        FROM jobs
        WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
        GROUP BY day
        ORDER BY day DESC
      )
    `).get(userId) as any;

    // Weekly peak: max completions in any single week
    const weeklyPeak = rawDb.prepare(`
      SELECT MAX(week_count) as peak FROM (
        SELECT COUNT(*) as week_count
        FROM jobs
        WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
        GROUP BY strftime('%Y-%W', DATE(completed_at))
      )
    `).get(userId) as any;

    // Consistency: number of distinct weeks with ≥1 completion (last 364 days)
    const consistencyWeeks = rawDb.prepare(`
      SELECT COUNT(DISTINCT strftime('%Y-%W', DATE(completed_at))) as weeks
      FROM jobs
      WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
        AND completed_at >= datetime('now', '-364 days')
    `).get(userId) as any;

    // Leaderboard rank: position by total points within family
    const leaderboardRank = rawDb.prepare(`
      SELECT RANK() OVER (ORDER BY points_total DESC) as rank
      FROM users WHERE id = ? AND family_id = ?
    `).get(userId, familyId) as any;

    // ─── Compute earned medals ──────────────────────────────────────

    const earnedAt = rawDb.prepare(`
      SELECT completed_at FROM jobs
      WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
      ORDER BY completed_at ASC LIMIT 1
    `).get(userId) as any;

    const medals: Array<{ type: string; level: string; earnedAt: string | null }> = [
      // Points medal
      {
        type: "points",
        level: _medalLevel(totalPoints?.points_total ?? 0, { bronze: 50, silver: 200, gold: 500, diamond: 1000 }),
        earnedAt: (totalPoints?.points_total ?? 0) >= 50 ? new Date().toISOString() : null,
      },
      // Tasks Completed medal
      {
        type: "tasks_completed",
        level: _medalLevel(totalCompleted?.cnt ?? 0, { bronze: 5, silver: 20, gold: 50, diamond: 100 }),
        earnedAt: (totalCompleted?.cnt ?? 0) >= 5 ? new Date().toISOString() : null,
      },
      // Streak medal
      {
        type: "streak",
        level: _medalLevel(streakCount?.streak ?? 0, { bronze: 3, silver: 7, gold: 14, diamond: 30 }),
        earnedAt: (streakCount?.streak ?? 0) >= 3 ? new Date().toISOString() : null,
      },
      // Weekly Peak medal
      {
        type: "weekly_peak",
        level: _medalLevel(weeklyPeak?.peak ?? 0, { bronze: 3, silver: 7, gold: 15, diamond: 25 }),
        earnedAt: (weeklyPeak?.peak ?? 0) >= 3 ? new Date().toISOString() : null,
      },
      // Consistency medal
      {
        type: "consistency",
        level: _medalLevel(consistencyWeeks?.weeks ?? 0, { bronze: 4, silver: 8, gold: 16, diamond: 30 }),
        earnedAt: (consistencyWeeks?.weeks ?? 0) >= 4 ? new Date().toISOString() : null,
      },
      // Leaderboard medal
      {
        type: "leaderboard",
        level: _medalLevel(leaderboardRank?.rank ?? 999, { bronze: 3, silver: 2, gold: 1, diamond: 1 }),
        earnedAt: (leaderboardRank?.rank ?? 999) <= 3 ? new Date().toISOString() : null,
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
