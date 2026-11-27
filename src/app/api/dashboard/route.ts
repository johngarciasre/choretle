import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { verifyAuth } from "@/lib/auth";
import { error } from "@/lib/logger.server";
import { currentStreakFromDays } from "@/lib/streak";

async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const householdId = auth.householdId;
    const userId = auth.userId;
    const role = auth.role || "child";

    if (!householdId) {
      return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    }

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ parent: {}, kid: {} });
    }

    // ─── Parent data ──────────────────────────────────────────────────────

    // Active lists with job status counts
    const activeLists = await rawDb.prepare(`
      SELECT l.id, l.name, l.start_date, l.end_date, l.status,
        (SELECT COUNT(*) FROM jobs j WHERE j.list_id = l.id AND j.status = 'todo') as todo_count,
        (SELECT COUNT(*) FROM jobs j WHERE j.list_id = l.id AND j.status = 'doing') as doing_count,
        (SELECT COUNT(*) FROM jobs j WHERE j.list_id = l.id AND j.status = 'done') as done_count,
        (SELECT COUNT(*) FROM jobs j WHERE j.list_id = l.id) as total_jobs
      FROM lists l
      WHERE l.household_id = ? AND l.status = 'active'
      ORDER BY l.start_date DESC
      LIMIT 10
    `).all(householdId) as any[];

    // Task and slate counts
    const taskCount = await rawDb.prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE household_id = ?`).get(householdId) as any;
    const slateCount = await rawDb.prepare(`SELECT COUNT(*) as cnt FROM slates WHERE household_id = ?`).get(householdId) as any;

    // Recent completed jobs (last 7 days)
    const recentDone = await rawDb.prepare(`
      SELECT j.name, j.completed_at, u.name as user_name
      FROM jobs j
      LEFT JOIN users u ON j.assigned_to = u.id
      WHERE j.list_id IN (SELECT id FROM lists WHERE household_id = ?)
        AND j.status = 'done' AND j.completed_at IS NOT NULL
        AND j.completed_at >= now() - interval '7 days'
      ORDER BY j.completed_at DESC
      LIMIT 10
    `).all(householdId) as any[];

    // ─── Kid data ─────────────────────────────────────────────────────────

    if (role === "child" && userId) {
      // Outstanding jobs (todo + doing) assigned to this kid
      const outstandingJobs = await rawDb.prepare(`
        SELECT j.id, j.name, j.description, j.points, j.status, j.due_date,
          s.name as slate_name
        FROM jobs j
        LEFT JOIN slate_tasks st ON j.slate_task_id = st.id
        LEFT JOIN slates s ON st.slate_id = s.id
        WHERE j.assigned_to = ?
          AND j.status IN ('todo', 'doing')
          AND j.list_id IN (SELECT id FROM lists WHERE household_id = ?)
        ORDER BY j.due_date ASC, j.created_at ASC
      `).all(userId, householdId) as any[];

      // Jobs requiring verification: verify_required lives on tasks, not slates.
      const pendingVerification = await rawDb.prepare(`
        SELECT j.id, j.name, j.points, j.updated_at,
          CASE WHEN EXISTS (
            SELECT 1 FROM job_history h
            WHERE h.job_id = j.id AND h.action = 'verify_request'
          ) THEN 1 ELSE 0 END as verification_requested
        FROM jobs j
        JOIN slate_tasks st ON st.id = j.slate_task_id
        JOIN tasks t ON t.id = st.task_id
        WHERE j.list_id IN (SELECT id FROM lists WHERE household_id = ?)
          AND j.assigned_to = ?
          AND j.status != 'done'
          AND t.verify_required = 1
        ORDER BY j.updated_at DESC
      `).all(householdId, userId) as any[];

      // Recently completed (last 30 days) for badges
      const recentlyCompleted = await rawDb.prepare(`
        SELECT j.name, j.points, j.completed_at
        FROM jobs j
        WHERE j.list_id IN (SELECT id FROM lists WHERE household_id = ?)
          AND j.assigned_to = ?
          AND j.status = 'done' AND j.completed_at IS NOT NULL
          AND j.completed_at >= now() - interval '30 days'
        ORDER BY j.completed_at DESC
      `).all(householdId, userId) as any[];

      // User stats for streaks/badges
      const userStats = await rawDb.prepare(`
        SELECT points_total,
          (SELECT COUNT(*) FROM jobs j2
           WHERE j2.assigned_to = ? AND j2.status = 'done' AND j2.completed_at IS NOT NULL
             AND j2.completed_at >= now() - interval '7 days') as weekly_done,
          (SELECT COUNT(*) FROM jobs j3
           WHERE j3.assigned_to = ? AND j3.status = 'done' AND j3.completed_at IS NOT NULL
             AND j3.completed_at >= now() - interval '30 days') as monthly_done
        FROM memberships WHERE user_id = ? AND household_id = ?
      `).get(userId, userId, userId, householdId) as any;

      // Current streak: consecutive days with at least one done job.
      const dayRows = await rawDb.prepare(`
        SELECT DISTINCT to_char(j.completed_at, 'YYYY-MM-DD') as day
        FROM jobs j
        WHERE j.assigned_to = ? AND j.status = 'done' AND j.completed_at IS NOT NULL
          AND j.list_id IN (SELECT id FROM lists WHERE household_id = ?)
        ORDER BY day DESC
      `).all(userId, householdId) as any[];
      const streak = currentStreakFromDays((dayRows || []).map((r: any) => String(r.day)));

      // Recent wins (badges from recently completed jobs)
      const recentWins = recentlyCompleted.slice(0, 5).map((j: any) => ({
        name: j.name,
        points: j.points,
        date: j.completed_at,
      }));

      return NextResponse.json({
        parent: {
          activeLists,
          taskCount: taskCount?.cnt || 0,
          slateCount: slateCount?.cnt || 0,
          recentDone,
        },
        kid: {
          outstandingJobs,
          pendingVerification,
          recentWins,
          stats: userStats || null,
          streakCount: streak,
          currentStreak: streak,
        },
      });
    }

    // Parent role — return parent data only
    return NextResponse.json({
      parent: {
        activeLists,
        taskCount: taskCount?.cnt || 0,
        slateCount: slateCount?.cnt || 0,
        recentDone,
      },
      kid: null,
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Dashboard GET failed");
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
