import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) return NextResponse.json({ error: "Family ID required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "daily";
    const date = searchParams.get("date");
    const memberId = searchParams.get("memberId");
    const days = parseInt(searchParams.get("days") || "7", 10);

    switch (type) {
      case "daily": {
        const targetDate = date || new Date().toISOString().split("T")[0];
        const jobs = rawDb.prepare(
          `SELECT j.*, u.name as assigned_name, t.name as task_name FROM jobs j LEFT JOIN users u ON j.assigned_to = u.id LEFT JOIN tasks t ON j.slate_task_id = t.id WHERE j.list_id IN (SELECT id FROM lists WHERE family_id = ? AND start_date <= ? AND end_date >= ?) ORDER BY j.created_at DESC`
        ).all(familyId, targetDate, targetDate) as any[];

        const users = rawDb.prepare(`SELECT id, name FROM users WHERE family_id = ?`).all(familyId) as any[];
        return NextResponse.json({ type: "daily", date: targetDate, jobs: jobs || [], users: users || [] });
      }

      case "done": {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const doneJobs = rawDb.prepare(
          `SELECT j.*, u.name as assigned_name, t.name as task_name FROM jobs j LEFT JOIN users u ON j.assigned_to = u.id LEFT JOIN tasks t ON j.slate_task_id = t.id WHERE j.status = 'done' AND j.list_id IN (SELECT id FROM lists WHERE family_id = ?) AND j.completed_at >= ? ORDER BY j.completed_at DESC`
        ).all(familyId, startDate.toISOString()) as any[];
        return NextResponse.json({ type: "done", days, jobs: doneJobs || [] });
      }

      case "task": {
        const tasks = rawDb.prepare(`SELECT * FROM tasks WHERE family_id = ? AND is_active = 1`).all(familyId) as any[];
        const taskStats: any[] = [];
        for (const task of (tasks || [])) {
          const stats = rawDb.prepare(
            `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done FROM jobs WHERE slate_task_id = ?`
          ).get(task.id) as any;
          taskStats.push({ taskId: task.id, name: task.name, total: stats?.total || 0, done: stats?.done || 0 });
        }
        return NextResponse.json({ type: "task", stats: taskStats });
      }

      case "member": {
        const members = rawDb.prepare(`SELECT * FROM users WHERE family_id = ?`).all(familyId) as any[];
        const memberStats: any[] = [];
        for (const member of (members || [])) {
          const stats = rawDb.prepare(
            `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done FROM jobs WHERE assigned_to = ?`
          ).get(member.id) as any;
          memberStats.push({ userId: member.id, name: member.name, totalPoints: member.points_total || 0,
            totalJobs: stats?.total || 0, doneJobs: stats?.done || 0 });
        }
        return NextResponse.json({ type: "member", stats: memberStats });
      }

      case "wallboard": {
        const wallData = rawDb.prepare(
          `SELECT u.name, COUNT(*) as total FROM jobs j JOIN users u ON j.assigned_to = u.id WHERE j.list_id IN (SELECT id FROM lists WHERE family_id = ?) GROUP BY u.id`
        ).all(familyId) as any[];
        return NextResponse.json({ type: "wallboard", data: wallData || [] });
      }

      default:
        return NextResponse.json({ error: `Unknown report type: ${type}` }, { status: 400 });
    }
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Reports GET failed");
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}
