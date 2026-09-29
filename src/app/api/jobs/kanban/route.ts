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

    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    // Kanban is a kid-focused view — allow any authenticated user for now
    // (role check enforced at UI level)

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json([]);
    }

    // All jobs for this kid across all statuses
    const kanbanJobs = rawDb.prepare(`
      SELECT j.id, j.name, j.description, j.points, j.status, j.due_date,
        s.name as slate_name
      FROM jobs j
      LEFT JOIN slate_tasks st ON j.slate_task_id = st.id
      LEFT JOIN slates s ON st.slate_id = s.id
      WHERE j.assigned_to = ?
        AND j.list_id IN (SELECT id FROM lists WHERE family_id = ?)
      ORDER BY
        CASE j.status WHEN 'todo' THEN 0 WHEN 'doing' THEN 1 WHEN 'done' THEN 2 END,
        j.due_date ASC, j.created_at ASC
    `).all(userId, familyId) as any[];

    // Recent completions for awards display (last 30 days)
    const recentCompletions = rawDb.prepare(`
      SELECT j.name, j.points, j.completed_at, u.name as assignee_name
      FROM jobs j
      LEFT JOIN users u ON j.assigned_to = u.id
      WHERE j.list_id IN (SELECT id FROM lists WHERE family_id = ?)
        AND j.assigned_to = ?
        AND j.status = 'done'
        AND j.completed_at IS NOT NULL
        AND j.completed_at >= datetime('now', '-30 days')
      ORDER BY j.completed_at DESC
      LIMIT 10
    `).all(familyId, userId) as any[];

    // User stats for the header
    const userStats = rawDb.prepare(`
      SELECT points_total,
        (SELECT COUNT(*) FROM jobs WHERE assigned_to = ? AND status = 'done'
         AND completed_at >= datetime('now', '-7 days')) as weekly_done
      FROM users WHERE id = ?
    `).get(userId, userId) as any;

    return NextResponse.json({
      jobs: kanbanJobs || [],
      recentCompletions: (recentCompletions || []).map((j: any) => ({
        name: j.name,
        points: j.points,
        completedAt: j.completed_at,
      })),
      stats: userStats || { points_total: 0, weekly_done: 0 },
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Kanban GET failed");
    return NextResponse.json({ error: "Failed to fetch kanban data" }, { status: 500 });
  }
}
