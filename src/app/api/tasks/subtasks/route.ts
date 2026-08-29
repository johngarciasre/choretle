import { NextRequest, NextResponse } from "next/server";
import { initDb, rawInsert } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");
    const jobId = searchParams.get("jobId");
    const familyId = auth.familyId;

    let query: any;

    if (jobId) {
      // Get job subtasks for a specific job
      query = db.select({
        subtask: schema.jobSubtasks,
        details: schema.subtasks,
      })
        .from(schema.jobSubtasks)
        .leftJoin(schema.subtasks, eq(schema.jobSubtasks.subtaskId, schema.subtasks.id))
        .where(and(eq(schema.jobSubtasks.jobId, jobId), sql`${schema.subtasks.familyId} = ${familyId}`));
    } else if (taskId) {
      // Get task subtasks
      query = db.select().from(schema.subtasks).where({ taskId, familyId }).orderBy(schema.subtasks.order);
    } else {
      return NextResponse.json({ error: "taskId or jobId is required" }, { status: 400 });
    }

    const subtasks = await query;
    return NextResponse.json(subtasks);
  } catch (err) {
    error({ err: err }, "Get subtasks failed");
    return NextResponse.json({ error: "Failed to fetch subtasks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const body = await request.json();
    const { taskId, jobId, subtaskId, name, points, order } = body;
    const familyId = auth.familyId;

    if (jobId && subtaskId) {
      // Create a job subtask instance from a task subtask
      const subtask = (await db.select().from(schema.subtasks).where({ id: subtaskId, familyId }).limit(1))[0];
      if (!subtask) {
        return NextResponse.json({ error: "Subtask not found in this family" }, { status: 404 });
      }

      const jobSubtask = await rawInsert("job_subtasks", {
        id: `js-${Date.now()}`,
        job_id: jobId,
        subtask_id: subtaskId,
        points_awarded: (subtask as any).points || points || 0,
      });

      return NextResponse.json(jobSubtask ? jobSubtask : null);
    }

    if (taskId && name) {
      // Create a task subtask
      const subtask = await rawInsert("subtasks", {
        id: `st-${Date.now()}`,
        family_id: familyId,
        task_id: taskId,
        name,
        points: points || 0,
        "order": order ?? 0,
        created_at: new Date().toISOString(),
      });

      return NextResponse.json(subtask ? subtask : null);
    }

    return NextResponse.json({ error: "taskId + name OR jobId + subtaskId required" }, { status: 400 });
  } catch (err) {
    error({ err: err }, "Create subtask failed");
    return NextResponse.json({ error: "Failed to create subtask" }, { status: 500 });
  }
}
