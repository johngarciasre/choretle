import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";
import { suspendTenant } from "@/db/tenant";

/** Jobs joined to their slate task and task. jobs.slate_task_id is a slate_tasks id. */
const JOB_SELECT = `
  SELECT j.*, u.name as assigned_name, t.name as task_name
  FROM jobs j
  LEFT JOIN users u ON j.assigned_to = u.id
  LEFT JOIN slate_tasks st ON j.slate_task_id = st.id
  LEFT JOIN tasks t ON st.task_id = t.id`;

async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "daily";
    const date = searchParams.get("date");
    const days = parseInt(searchParams.get("days") || "7", 10);

    // Cross-household reporting: aggregates only, and only while a two-sided
    // link is active. Never jobs, comments or photos.
    if (searchParams.get("scope") === "linked") {
      const partners = (await suspendTenant(() =>
        rawDb
          .prepare(
            `select case when household_id = ? then linked_household_id else household_id end as other_id
               from household_links
              where (household_id = ? or linked_household_id = ?) and status = 'active'`,
          )
          .all(householdId, householdId, householdId),
      )) as { other_id: string }[];

      if (partners.length === 0) {
        return NextResponse.json({ error: "No active household link" }, { status: 403 });
      }

      const ids = [householdId, ...partners.map((partner) => partner.other_id)];
      const households = [];
      for (const id of ids) {
        const household = (await suspendTenant(() =>
          rawDb.prepare(`select name from households where id = ?`).get(id),
        )) as { name: string } | undefined;
        const stats = (await suspendTenant(() =>
          rawDb
          .prepare(
            `select
               (select coalesce(sum(m.points_total), 0) from memberships m where m.household_id = ?) as points,
               (select count(*) from jobs j join lists l on l.id = j.list_id
                 where l.household_id = ? and j.status = 'done' and j.completed_at is not null
                   and j.completed_at >= now() - interval '7 days') as completed,
               (select count(*) from memberships m where m.household_id = ?) as members`,
          )
          .get(id, id, id),
        )) as { points: number | string; completed: number | string; members: number | string };
        households.push({
          householdId: id,
          name: household?.name ?? "",
          points: Number(stats?.points ?? 0),
          completedJobs: Number(stats?.completed ?? 0),
          memberCount: Number(stats?.members ?? 0),
          isCurrent: id === householdId,
        });
      }

      return NextResponse.json({ type: "linked", households });
    }

    switch (type) {
      case "daily": {
        const targetDate = date || new Date().toISOString().split("T")[0];
        // lists.start_date holds a full timestamp and end_date is never set, so
        // compare on the date part. One-off chores share a single long-lived
        // hidden list, so they belong to the day their job was created.
        const jobs = await rawDb.prepare(
          `${JOB_SELECT} WHERE j.list_id IN (
             SELECT l.id FROM lists l
             WHERE l.household_id = ?
               AND (l.start_date::date = ?::date OR (l.period = 'one-off' AND j.created_at::date = ?::date))
           ) ORDER BY j.created_at DESC`
        ).all(householdId, targetDate, targetDate) as any[];

        const users = await rawDb.prepare(`SELECT u.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.household_id = ?`).all(householdId) as any[];
        return NextResponse.json({ type: "daily", date: targetDate, jobs: jobs || [], users: users || [] });
      }

      case "done": {
        // Filter by when the job was finished, not by when its list started.
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const doneJobs = await rawDb.prepare(
          `${JOB_SELECT} WHERE j.status = 'done' AND j.completed_at IS NOT NULL AND j.completed_at >= ? AND j.list_id IN (SELECT id FROM lists WHERE household_id = ?) ORDER BY j.completed_at DESC`
        ).all(startDate.toISOString(), householdId) as any[];
        return NextResponse.json({ type: "done", days, jobs: doneJobs || [] });
      }

      case "task": {
        const tasks = await rawDb.prepare(`SELECT * FROM tasks WHERE household_id = ? AND is_active = 1`).all(householdId) as any[];
        const taskStats: any[] = [];
        for (const task of (tasks || [])) {
          const stats = await rawDb.prepare(
            `SELECT COUNT(*) as total, SUM(CASE WHEN j.status = 'done' THEN 1 ELSE 0 END) as done
             FROM jobs j
             WHERE j.slate_task_id IN (SELECT id FROM slate_tasks WHERE task_id = ?)
               AND j.list_id IN (SELECT id FROM lists WHERE household_id = ?)`
          ).get(task.id, householdId) as any;
          taskStats.push({ taskId: task.id, name: task.name, total: stats?.total || 0, done: stats?.done || 0 });
        }
        return NextResponse.json({ type: "task", stats: taskStats });
      }

      case "task_completion": {
        const startParam = searchParams.get("startDate");
        const endParam = searchParams.get("endDate");
        const rangeStart = startParam ? new Date(startParam) : (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d; })();
        const rangeEnd = endParam ? new Date(endParam) : new Date();
        // Include the whole end day. Date-only params parse as UTC midnight, so
        // close the day in UTC too — setHours would use the host's local zone
        // and cut the window short on any non-UTC server.
        rangeEnd.setUTCHours(23, 59, 59, 999);
        if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
          return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
        }

        // Completion stats per task in the date range. The denominator is the
        // jobs scheduled in that range; the numerator counts finished ones.
        const tasks = await rawDb.prepare(
          `SELECT t.id, t.name FROM tasks t WHERE t.household_id = ? AND t.is_active = 1`
        ).all(householdId) as any[];

        const stats: any[] = [];
        for (const task of (tasks || [])) {
          const s = await rawDb.prepare(
            `SELECT COUNT(*) as total, SUM(CASE WHEN j.status = 'done' THEN 1 ELSE 0 END) as done
             FROM jobs j
             JOIN lists l ON j.list_id = l.id
             WHERE l.household_id = ?
               AND j.slate_task_id IN (SELECT id FROM slate_tasks WHERE task_id = ?)
               AND l.start_date >= ? AND l.start_date <= ?`
          ).get(householdId, task.id, rangeStart.toISOString(), rangeEnd.toISOString()) as any;
          const total = s?.total || 0;
          const done = s?.done || 0;
          stats.push({
            taskId: task.id,
            taskName: task.name,
            totalJobs: total,
            completedJobs: done,
            completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
          });
        }

        // Jobs actually finished inside the range.
        const jobsList = await rawDb.prepare(
          `${JOB_SELECT}
           WHERE j.status = 'done' AND j.completed_at IS NOT NULL
             AND j.completed_at >= ? AND j.completed_at <= ?
             AND j.list_id IN (SELECT id FROM lists WHERE household_id = ?)
           ORDER BY j.completed_at DESC`
        ).all(rangeStart.toISOString(), rangeEnd.toISOString(), householdId) as any[];

        return NextResponse.json({
          type: "task_completion",
          startDate: rangeStart.toISOString().split("T")[0],
          endDate: rangeEnd.toISOString().split("T")[0],
          stats,
          jobs: (jobsList || []).map((j: any) => ({
            id: j.id,
            name: j.task_name || j.name,
            assignedTo: j.assigned_name,
            completedAt: j.completed_at,
            points: j.points,
          })),
        });
      }

      case "member": {
        const members = await rawDb.prepare(`SELECT u.id, u.name, u.email, u.avatar_url, m.role, m.points_total FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.household_id = ?`).all(householdId) as any[];
        const memberStats: any[] = [];
        for (const member of (members || [])) {
          const stats = await rawDb.prepare(
            `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
             FROM jobs WHERE assigned_to = ? AND list_id IN (SELECT id FROM lists WHERE household_id = ?)`
          ).get(member.id, householdId) as any;
          memberStats.push({ userId: member.id, name: member.name, totalPoints: member.points_total || 0,
            totalJobs: stats?.total || 0, doneJobs: stats?.done || 0 });
        }
        return NextResponse.json({ type: "member", stats: memberStats });
      }

      case "wallboard": {
        const wallData = await rawDb.prepare(
          `SELECT u.name, COUNT(*) as total FROM jobs j JOIN users u ON j.assigned_to = u.id WHERE j.list_id IN (SELECT id FROM lists WHERE household_id = ?) GROUP BY u.id, u.name`
        ).all(householdId) as any[];
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

const GET_impl = withTenant(GET);
export { GET_impl as GET };
