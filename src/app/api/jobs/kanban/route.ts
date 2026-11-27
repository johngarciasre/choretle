import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { verifyAuth } from "@/lib/auth";
import { error } from "@/lib/logger.server";

async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const householdId = auth.householdId;
    const userId = auth.userId || request.headers.get("x-user-id") || "";

    if (!householdId) {
      return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    }

    // Kanban is a kid-focused view — allow any authenticated user for now
    // (role check enforced at UI level)

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json([]);
    }

    // All jobs for this kid across all statuses
    const kanbanJobs = await rawDb.prepare(`
      SELECT j.id, j.name, j.description, j.points, j.status, j.due_date, j.verify_required,
        s.name as slate_name
      FROM jobs j
      LEFT JOIN slate_tasks st ON j.slate_task_id = st.id
      LEFT JOIN slates s ON st.slate_id = s.id
      WHERE j.assigned_to = ?
        AND j.list_id IN (SELECT id FROM lists WHERE household_id = ?)
      ORDER BY
        CASE j.status WHEN 'todo' THEN 0 WHEN 'doing' THEN 1 WHEN 'under_review' THEN 2 WHEN 'done' THEN 3 END,
        j.due_date ASC, j.created_at ASC
    `).all(userId, householdId) as any[];

    // Recent completions for awards display (last 30 days)
    const recentCompletions = await rawDb.prepare(`
      SELECT j.name, j.points, j.completed_at, u.name as assignee_name
      FROM jobs j
      LEFT JOIN users u ON j.assigned_to = u.id
      WHERE j.list_id IN (SELECT id FROM lists WHERE household_id = ?)
        AND j.assigned_to = ?
        AND j.status = 'done'
        AND j.completed_at IS NOT NULL
        AND j.completed_at >= now() - interval '30 days'
      ORDER BY j.completed_at DESC
      LIMIT 10
    `).all(householdId, userId) as any[];

    // User stats for the header
    const userStats = await rawDb.prepare(`
      SELECT points_total,
        (SELECT COUNT(*) FROM jobs WHERE assigned_to = ? AND status = 'done'
         AND completed_at >= now() - interval '7 days') as weekly_done
      FROM memberships WHERE user_id = ? AND household_id = ?
    `).get(userId, userId, householdId) as any;

    // Upcoming jobs for this kid (next 3, ordered by due_date then created_at)
    const upcomingJobs = await rawDb.prepare(`
      SELECT j.id, j.name, j.description, j.points, j.status, j.due_date,
        s.name as slate_name
      FROM jobs j
      LEFT JOIN slate_tasks st ON j.slate_task_id = st.id
      LEFT JOIN slates s ON st.slate_id = s.id
      WHERE j.assigned_to = ?
        AND j.list_id IN (SELECT id FROM lists WHERE household_id = ?)
        AND j.status IN ('todo', 'doing')
      ORDER BY j.due_date ASC, j.created_at ASC
      LIMIT 3
    `).all(userId, householdId) as any[];

    // Chores nobody owns yet — the grab pool for this household.
    const availableJobs = await rawDb.prepare(`
      SELECT j.id, j.name, j.description, j.points, j.due_date,
        s.name as slate_name
      FROM jobs j
      LEFT JOIN slate_tasks st ON j.slate_task_id = st.id
      LEFT JOIN slates s ON st.slate_id = s.id
      WHERE j.assigned_to IS NULL
        AND j.status = 'todo'
        AND j.list_id IN (SELECT id FROM lists WHERE household_id = ?)
      ORDER BY j.due_date ASC, j.created_at ASC
    `).all(householdId) as any[];

    return NextResponse.json({
      jobs: kanbanJobs || [],
      available: availableJobs || [],
      recentCompletions: (recentCompletions || []).map((j: any) => ({
        name: j.name,
        points: j.points,
        completedAt: j.completed_at,
      })),
      upcoming: (upcomingJobs || []).map((j: any) => ({
        id: j.id,
        name: j.name,
        description: j.description,
        points: j.points,
        status: j.status,
        dueDate: j.due_date,
        slateName: j.slate_name,
      })),
      stats: userStats || { points_total: 0, weekly_done: 0 },
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Kanban GET failed");
    return NextResponse.json({ error: "Failed to fetch kanban data" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
