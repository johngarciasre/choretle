import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const listId = request.headers.get("x-list-id") || "";

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json([]);
    }

    // If listId is provided, fetch jobs for that specific list using raw SQL
    if (listId) {
      const jobs = rawDb.prepare(`SELECT * FROM jobs WHERE list_id = ?`).all(listId) as any[];
      return NextResponse.json(jobs);
    }

    // Otherwise, fetch all jobs for the family using raw SQL
    const jobsRaw = rawDb.prepare(
      `SELECT j.*, s.name as slate_name, t.name as task_name, t.points as task_points
         FROM jobs j
         LEFT JOIN slate_tasks st ON j.slate_task_id = st.id
         LEFT JOIN slates s ON st.slate_id = s.id
         LEFT JOIN tasks t ON st.task_id = t.id
         WHERE j.list_id IN (SELECT id FROM lists WHERE family_id = ?)
         ORDER BY j.created_at DESC`
    ).all(familyId);

    return NextResponse.json(jobsRaw);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Get jobs failed");
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    const body = await request.json();
    if (!body?.slateId) {
      return NextResponse.json({ error: "slateId is required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const now = new Date().toISOString();
    const jobId = `job-${Date.now()}`;

    rawDb.prepare(
      `INSERT INTO jobs (id, list_id, name, description, points, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'todo', ?, ?)`
    ).run(
      jobId,
      body.slateId,
      body.name || "",
      body.description || null,
      body.points || 0,
      now,
      now,
    );

    const job = rawDb.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as any;

    return NextResponse.json(job);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Create job failed");
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    const body = await request.json();
    if (!body?.id || !body?.status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const now = new Date().toISOString();
    rawDb.prepare(
      `UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?`
    ).run(body.status, now, body.id);

    const job = rawDb.prepare(`SELECT * FROM jobs WHERE id = ?`).get(body.id) as any;

    return NextResponse.json(job);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Update job failed");
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    const body = await request.json();
    if (!body?.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    rawDb.prepare(`DELETE FROM jobs WHERE id = ?`).run(body.id);

    return NextResponse.json({ ok: true, deleted: body.id });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Delete job failed");
    return NextResponse.json({ error: "Failed to delete job" }, { status: 500 });
  }
}
