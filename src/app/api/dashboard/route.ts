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

    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    const userId = request.headers.get("x-user-id") || "";
    const role = request.headers.get("x-role") || "child";

    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ parent: {}, kid: {} });
    }

    // ─── Parent data ──────────────────────────────────────────────────────

    // Active lists with job status counts
    const activeLists = rawDb.prepare(`
      SELECT l.id, l.name, l.start_date, l.end_date, l.status,
        COALESCE(todo.cnt, 0) as todo_count,
        COALESCE(doing.cnt, 0) as doing_count,
        COALESCE(done.cnt, 0) as done_count,
        COUNT(j.id) as total_jobs
      FROM lists l
      LEFT JOIN (
        SELECT list_id, COUNT(*) as cnt FROM jobs WHERE status = 'todo' GROUP BY list_id
      ) todo ON l.id = todo.list_id
      LEFT JOIN (
        SELECT list_id, COUNT(*) as cnt FROM jobs WHERE status = 'doing' GROUP BY list_id
      ) doing ON l.id = doing.list_id
      LEFT JOIN (
        SELECT list_id, COUNT(*) as cnt FROM jobs WHERE status = 'done' GROUP BY list_id
      ) done ON l.id = done.list_id
      LEFT JOIN jobs j ON l.id = j.list_id
      WHERE l.family_id = ? AND l.status = 'active'
      GROUP BY l.id
      ORDER BY l.start_date DESC
      LIMIT 10
    `).all(familyId) as any[];

    // Task and slate counts
    const taskCount = rawDb.prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE family_id = ?`).get(familyId) as any;
    const slateCount = rawDb.prepare(`SELECT COUNT(*) as cnt FROM slates WHERE family_id = ?`).get(familyId) as any;

    // Recent completed jobs (last 7 days)
    const recentDone = rawDb.prepare(`
      SELECT j.name, j.completed_at, u.name as user_name
      FROM jobs j
      LEFT JOIN users u ON j.assigned_to = u.id
      WHERE j.list_id IN (SELECT id FROM lists WHERE family_id = ?)
        AND j.status = 'done' AND j.completed_at IS NOT NULL
        AND j.completed_at >= datetime('now', '-7 days')
      ORDER BY j.completed_at DESC
      LIMIT 10
    `).all(familyId) as any[];

    // ─── Kid data ─────────────────────────────────────────────────────────

    if (role === "child" && userId) {
      // Outstanding jobs (todo + doing) assigned to this kid
      const outstandingJobs = rawDb.prepare(`
        SELECT j.id, j.name, j.description, j.points, j.status, j.due_date,
          s.name as slate_name
        FROM jobs j
        LEFT JOIN slate_tasks st ON j.slate_task_id = st.id
        LEFT JOIN slates s ON st.slate_id = s.id
        WHERE j.assigned_to = ?
          AND j.status IN ('todo', 'doing')
        ORDER BY j.due_date ASC, j.created_at ASC
      `).all(userId) as any[];

      // Jobs requiring verification (not yet done, verify_required on parent task)
      const pendingVerification = rawDb.prepare(`
        SELECT j.id, j.name, j.points, j.updated_at,
          CASE WHEN EXISTS (
            SELECT 1 FROM job_history h
            WHERE h.job_id = j.id AND h.action = 'verify_request'
          ) THEN 1 ELSE 0 END as verification_requested
        FROM jobs j
        WHERE j.list_id IN (SELECT id FROM lists WHERE family_id = ?)
          AND j.assigned_to = ?
          AND j.status != 'done'
          AND EXISTS (
            SELECT 1 FROM slate_tasks st
            JOIN slates s ON s.id = st.slate_id
            WHERE st.id = j.slate_task_id AND s.verify_required = 1
          )
        ORDER BY j.updated_at DESC
      `).all(familyId, userId) as any[];

      // Recently completed (last 30 days) for badges
      const recentlyCompleted = rawDb.prepare(`
        SELECT j.name, j.points, j.completed_at
        FROM jobs j
        WHERE j.list_id IN (SELECT id FROM lists WHERE family_id = ?)
          AND j.assigned_to = ?
          AND j.status = 'done' AND j.completed_at IS NOT NULL
          AND j.completed_at >= datetime('now', '-30 days')
        ORDER BY j.completed_at DESC
      `).all(familyId, userId) as any[];

      // User stats for streaks/badges
      const userStats = rawDb.prepare(`
        SELECT points_total,
          (SELECT COUNT(*) FROM jobs j2
           WHERE j2.assigned_to = ? AND j2.status = 'done' AND j2.completed_at IS NOT NULL
             AND j2.completed_at >= datetime('now', '-7 days')) as weekly_done,
          (SELECT COUNT(*) FROM jobs j3
           WHERE j3.assigned_to = ? AND j3.status = 'done' AND j3.completed_at IS NOT NULL
             AND j3.completed_at >= datetime('now', '-30 days')) as monthly_done
        FROM users WHERE id = ?
      `).get(userId, userId, userId) as any;

      // Streak calculation: consecutive days with at least one done job
      const streakCount = rawDb.prepare(`
        SELECT COUNT(*) as streak FROM (
          SELECT DATE(j.completed_at) as day
          FROM jobs j
          WHERE j.assigned_to = ? AND j.status = 'done'
            AND j.completed_at IS NOT NULL
          GROUP BY day
          ORDER BY day DESC
          LIMIT 7
        )
      `).get(userId) as any;

      // Nearest-to-complete: longest streak currently on
      const currentStreak = rawDb.prepare(`
        SELECT COUNT(*) as streak FROM (
          SELECT DATE(j.completed_at) as day
          FROM jobs j
          WHERE j.assigned_to = ? AND j.status = 'done'
            AND j.completed_at IS NOT NULL
          ORDER BY day DESC
          LIMIT 30
        )
      `).get(userId) as any;

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
          streakCount: streakCount?.streak || 0,
          currentStreak: currentStreak?.streak || 0,
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
