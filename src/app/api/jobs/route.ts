import { NextRequest, NextResponse } from "next/server";
import { getJobsByList, createJob, updateJob, deleteJob } from "@/lib/db/service";
import { initDb, getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const listId = request.headers.get("x-list-id") || "";

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) {
      return NextResponse.json([]);
    }

    // If listId is provided, fetch jobs for that specific list
    if (listId) {
      const jobs = await getJobsByList(listId);
      return NextResponse.json(jobs);
    }

    // Otherwise, fetch all jobs for the family
    const raw = getRawDb();
    if (!raw) return NextResponse.json([]);

    const jobsRaw = raw.prepare(
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
    error({ err }, "Get jobs failed");
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
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
    const jobData = {
      list_id: body.slateId,
      name: body.name || "",
      description: body.description,
      points: body.points || 0,
    };
    const job = await createJob(jobData);
    if (!job) throw new Error("Failed to create job");
    return NextResponse.json(job);
  } catch (err) {
    error({ err: err }, "Create job failed");
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
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
    const job = await updateJob(body.id, { status: body.status });
    if (!job) throw new Error("Failed to update job");
    return NextResponse.json(job);
  } catch (err) {
    error({ err: err }, "Update job failed");
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
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
    const deleted = await deleteJob(body.id);
    if (!deleted) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, deleted: body.id });
  } catch (err) {
    error({ err: err }, "Delete job failed");
    return NextResponse.json({ error: "Failed to delete job" }, { status: 500 });
  }
}
