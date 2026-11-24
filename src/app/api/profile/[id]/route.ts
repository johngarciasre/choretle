import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";
import { currentStreakFromDays } from "@/lib/streak";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const familyId = auth.familyId;
    if (!familyId) return NextResponse.json({ error: "Family ID required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const targetUserId = (await params).id;

    // Verify user belongs to family
    const userProfileRows = rawDb.prepare(`SELECT * FROM users WHERE id = ? AND family_id = ?`).get(targetUserId, familyId) as any;
    if (!userProfileRows) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Fetch completed jobs with task info (jobs.slate_task_id -> slate_tasks -> tasks)
    const completedJobs = rawDb.prepare(
      `SELECT j.*, t.name as task_name, t.points as task_points
       FROM jobs j
       LEFT JOIN slate_tasks st ON j.slate_task_id = st.id
       LEFT JOIN tasks t ON st.task_id = t.id
       WHERE j.assigned_to = ? AND j.status = 'done' AND j.list_id IN (SELECT id FROM lists WHERE family_id = ?)
       ORDER BY j.completed_at DESC LIMIT 50`
    ).all(targetUserId, familyId) as any[];

    // Fetch recent jobs (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentJobs = rawDb.prepare(
      `SELECT j.*, t.name as task_name
       FROM jobs j
       LEFT JOIN slate_tasks st ON j.slate_task_id = st.id
       LEFT JOIN tasks t ON st.task_id = t.id
       WHERE j.assigned_to = ? AND j.created_at >= ? AND j.list_id IN (SELECT id FROM lists WHERE family_id = ?)
       ORDER BY j.created_at DESC LIMIT 20`
    ).all(targetUserId, thirtyDaysAgo.toISOString(), familyId) as any[];

    const dayRows = rawDb.prepare(
      `SELECT DISTINCT DATE(j.completed_at) as day
       FROM jobs j
       WHERE j.assigned_to = ? AND j.status = 'done' AND j.completed_at IS NOT NULL
         AND j.list_id IN (SELECT id FROM lists WHERE family_id = ?)`
    ).all(targetUserId, familyId) as any[];
    const streakCount = currentStreakFromDays((dayRows || []).map((r: any) => String(r.day)));

    // Fetch daily stats for the last 7 days
    const dailyStats: any[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const dateStr = day.toISOString().split("T")[0];
      const stats = rawDb.prepare(
        `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
         FROM jobs WHERE assigned_to = ? AND DATE(created_at) = ? AND list_id IN (SELECT id FROM lists WHERE family_id = ?)`
      ).get(targetUserId, dateStr, familyId) as any;
      dailyStats.push({ date: dateStr, total: stats?.total || 0, done: stats?.done || 0 });
    }

    return NextResponse.json({
      user: {
        id: userProfileRows.id,
        name: userProfileRows.name,
        email: userProfileRows.email,
        role: userProfileRows.role,
        avatarUrl: userProfileRows.avatar_url,
        pointsTotal: userProfileRows.points_total || 0,
        createdAt: userProfileRows.created_at,
        streakCount,
      },
      completedJobs: (completedJobs || []).map((j: any) => ({
        id: j.id, name: j.name, status: j.status, taskName: j.task_name,
        // Points actually awarded for this job, not the task template's value.
        points: j.points || 0, completedAt: j.completed_at,
      })),
      recentJobs: (recentJobs || []).map((j: any) => ({
        id: j.id, name: j.name, status: j.status, taskName: j.task_name,
        createdAt: j.created_at,
      })),
      dailyStats,
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Profile GET failed");
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
