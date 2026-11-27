import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, verifyPicker } from "@/lib/auth";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { noCache } from "@/lib/http";

/**
 * Kiosk summary: how much of today is done, and how the household is doing this
 * week. Aggregates only — no job names, no chore detail.
 */
async function GET(request: NextRequest) {
  try {
    const picker = await verifyPicker(request);
    const auth = picker ? null : await verifyAuth(request);
    const householdId = picker?.householdId ?? auth?.householdId;
    if (!householdId) return NextResponse.json({ error: "Not available" }, { status: 401 });

    const db = getDb();

    const today = (await db
      .prepare(
        `select
           count(*) as total,
           sum(case when j.status = 'done' then 1 else 0 end) as done
         from jobs j
         join lists l on l.id = j.list_id
        where l.household_id = ?
          and l.status = 'active'
          and (j.created_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date`,
      )
      .get(householdId)) as { total: number | string; done: number | string } | undefined;

    const week = (await db
      .prepare(
        `select count(*) as completed, coalesce(sum(j.points), 0) as points
           from jobs j
           join lists l on l.id = j.list_id
          where l.household_id = ? and j.status = 'done'
            and j.completed_at is not null
            and j.completed_at >= now() - interval '7 days'`,
      )
      .get(householdId)) as { completed: number | string; points: number | string } | undefined;

    const total = Number(today?.total ?? 0);
    const done = Number(today?.done ?? 0);

    return noCache(
      NextResponse.json({
        today: {
          totalJobs: total,
          doneJobs: done,
          remainingJobs: Math.max(total - done, 0),
          completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
        },
        week: {
          completedJobs: Number(week?.completed ?? 0),
          points: Number(week?.points ?? 0),
        },
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Kiosk wallboard failed");
    return NextResponse.json({ error: "Failed to load the wallboard" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
