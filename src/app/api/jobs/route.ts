import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { verifyAuth, canAuthor } from "@/lib/auth";
import { canTransition } from "@/lib/jobStatus";

/** A list is only usable when it belongs to the caller's household. */
async function listBelongsToHousehold(rawDb: any, listId: string, householdId: string): Promise<boolean> {
  const row = await rawDb.prepare(`SELECT id FROM lists WHERE id = ? AND household_id = ?`).get(listId, householdId);
  return !!row;
}

/**
 * One-off chores have no slate, but a job must belong to a list and every
 * household scope check goes through lists. Give each household one hidden list,
 * keyed by a slate_id no real slate uses, created the first time it is needed.
 */
async function getOrCreateOneOffList(rawDb: any, householdId: string): Promise<string> {
  const slateKey = `one-off-${householdId}`;
  const existing = await rawDb.prepare(
    `SELECT id FROM lists WHERE household_id = ? AND slate_id = ?`
  ).get(householdId, slateKey) as any;
  if (existing) return existing.id;

  const id = `list-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await rawDb.prepare(
    `INSERT INTO lists (id, slate_id, household_id, name, start_date, end_date, period, status, created_at)
     VALUES (?, ?, ?, 'One-off chores', ?, NULL, 'one-off', 'active', ?)
     ON CONFLICT DO NOTHING`
  ).run(id, slateKey, householdId, now, now);

  const created = await rawDb.prepare(
    `SELECT id FROM lists WHERE household_id = ? AND slate_id = ?`
  ).get(householdId, slateKey) as any;
  return created.id;
}

async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const householdId = auth.householdId;
    const listId = request.headers.get("x-list-id") || request.nextUrl.searchParams.get("listId") || "";

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json([]);
    }

    // If listId is provided, fetch jobs for that specific list — but only ours.
    if (listId) {
      if (!(await listBelongsToHousehold(rawDb, listId, householdId))) {
        return NextResponse.json({ error: "List not found" }, { status: 404 });
      }
      const jobs = await rawDb.prepare(`SELECT * FROM jobs WHERE list_id = ?`).all(listId) as any[];
      return NextResponse.json(jobs);
    }

    // Otherwise, fetch all jobs for the household
    const jobsRaw = await rawDb.prepare(
      `SELECT j.*, s.name as slate_name, t.name as task_name, t.points as task_points,
              u.name as assignee_name
         FROM jobs j
         LEFT JOIN slate_tasks st ON j.slate_task_id = st.id
         LEFT JOIN slates s ON st.slate_id = s.id
         LEFT JOIN tasks t ON st.task_id = t.id
         LEFT JOIN users u ON j.assigned_to = u.id
         WHERE j.list_id IN (SELECT id FROM lists WHERE household_id = ?)
         ORDER BY j.created_at DESC`
    ).all(householdId);

    return NextResponse.json(jobsRaw);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Get jobs failed");
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}

async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // No listId means a one-off chore, created directly instead of by a slate.
    let listId = body?.listId as string | undefined;
    if (!listId) {
      if (!canAuthor(auth)) {
        return NextResponse.json({ error: "Parent access required" }, { status: 403 });
      }
      if (!String(body?.name || "").trim()) {
        return NextResponse.json({ error: "name is required" }, { status: 400 });
      }
      if (body?.assignedTo) {
        const member = await rawDb.prepare(
          `SELECT user_id FROM memberships WHERE user_id = ? AND household_id = ?`
        ).get(body.assignedTo, auth.householdId);
        if (!member) {
          return NextResponse.json({ error: "assignedTo must be a member of your household" }, { status: 400 });
        }
      }
      if (body?.dueDate && isNaN(new Date(body.dueDate).getTime())) {
        return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
      }
      listId = await getOrCreateOneOffList(rawDb, auth.householdId);
    } else if (!(await listBelongsToHousehold(rawDb, listId, auth.householdId))) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // A job may point at a slate task, and that task must belong to this household.
    if (body.slateTaskId && !await rawDb.prepare(
      `SELECT st.id FROM slate_tasks st JOIN slates s ON s.id = st.slate_id WHERE st.id = ? AND s.household_id = ?`
    ).get(body.slateTaskId, auth.householdId)) {
      return NextResponse.json({ error: "slateTaskId must belong to your household" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const jobId = `job-${crypto.randomUUID()}`;
    const points = Number.isFinite(Number(body.points)) ? Math.trunc(Number(body.points)) : 0;

    await rawDb.prepare(
      `INSERT INTO jobs (id, list_id, slate_task_id, assigned_to, name, description, points, status, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?)`
    ).run(
      jobId,
      listId,
      body.slateTaskId || null,
      body.assignedTo || null,
      body.name || "",
      body.description || null,
      points,
      body.dueDate ? new Date(body.dueDate).toISOString() : null,
      now,
      now,
    );

    const job = await rawDb.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as any;
    return NextResponse.json(job);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Create job failed");
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }
}

async function PUT(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    if (!body?.id || !body?.status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    }

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const job = await rawDb.prepare(
      `SELECT j.* FROM jobs j JOIN lists l ON j.list_id = l.id WHERE j.id = ? AND l.household_id = ?`
    ).get(body.id, auth.householdId) as any;
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    if (!canTransition(job.status, body.status)) {
      return NextResponse.json(
        { error: `Invalid status change from "${job.status}" to "${body.status}"` },
        { status: 400 },
      );
    }

    await rawDb.prepare(`UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?`)
      .run(body.status, new Date().toISOString(), body.id);

    const updated = await rawDb.prepare(`SELECT * FROM jobs WHERE id = ?`).get(body.id) as any;
    return NextResponse.json(updated);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Update job failed");
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}

async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    if (!body?.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const result = await rawDb.prepare(
      `DELETE FROM jobs WHERE id = ? AND list_id IN (SELECT id FROM lists WHERE household_id = ?)`
    ).run(body.id, auth.householdId);

    if (result.changes === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, deleted: body.id });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Delete job failed");
    return NextResponse.json({ error: "Failed to delete job" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
const POST_impl = withTenant(POST);
export { POST_impl as POST };
const PUT_impl = withTenant(PUT);
export { PUT_impl as PUT };
const DELETE_impl = withTenant(DELETE);
export { DELETE_impl as DELETE };
