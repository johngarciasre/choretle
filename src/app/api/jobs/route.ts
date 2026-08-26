import { NextRequest, NextResponse } from "next/server";
import { getJobsByList, createJob, updateJob, deleteJob } from "@/lib/db/service";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { error } from "@/lib/logger.server";

export async function GET(request: NextRequest) {
  try {
    const listId = request.headers.get("x-list-id") || "";
    const familyId = request.headers.get("x-family-id") || new URL(request.url).searchParams.get("familyId");
    
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
    if (familyId) {
      const jobs = await db.select({
        job: schema.jobs,
        slateTask: schema.slateTasks,
        task: schema.tasks,
      })
        .from(schema.jobs)
        .leftJoin(schema.slateTasks, eq(schema.jobs.slateTaskId, schema.slateTasks.id))
        .leftJoin(schema.tasks, eq(schema.slateTasks.taskId, schema.tasks.id))
        .where(
          sql`${schema.jobs.listId} IN (SELECT id FROM lists WHERE family_id = ${familyId})`
        )
        .orderBy(sql`created_at DESC`);

      return NextResponse.json((jobs as any[]) || []);
    }

    return NextResponse.json([]);
  } catch (err) {
    error({ err }, "Get jobs failed");
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
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
