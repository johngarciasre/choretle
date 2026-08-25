import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { error } from "@/lib/logger.server";

export async function GET(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");
    const jobId = searchParams.get("jobId");
    const familyId = request.headers.get("x-family-id") || new URL(request.url).searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

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
    } else if (taskId) {
      // Get task subtasks
      query = db.select().from(schema.subtasks).where({ taskId, familyId }).orderBy(schema.subtasks.order);
    } else {
      return NextResponse.json({ error: "taskId or jobId is required" }, { status: 400 });
    }

    const subtasks = await query;
    return NextResponse.json(subtasks);
  } catch (error) {
    error({ err: error }, "Get subtasks failed");
    return NextResponse.json({ error: "Failed to fetch subtasks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const body = await request.json();
    const { taskId, jobId, subtaskId, name, points, order } = body;
    const familyId = request.headers.get("x-family-id") || new URL(request.url).searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    if (jobId && subtaskId) {
      // Create a job subtask instance from a task subtask
      const subtask = (await db.select().from(schema.subtasks).where({ id: subtaskId, familyId }).limit(1))[0];
      if (!subtask) {
        return NextResponse.json({ error: "Subtask not found in this family" }, { status: 404 });
      }

      const jobSubtask = await db.insert(schema.jobSubtasks).values({
        jobId,
        subtaskId,
        pointsAwarded: (subtask as any).points || points || 0,
      }).returning("*");

      return NextResponse.json(jobSubtask ? jobSubtask[0] : null);
    }

    if (taskId && name) {
      // Create a task subtask
      const subtask = await db.insert(schema.subtasks).values({
        familyId,
        taskId,
        name,
        points: points || 0,
        order: order ?? 0,
      }).returning("*");

      return NextResponse.json(subtask ? subtask[0] : null);
    }

    return NextResponse.json({ error: "taskId + name OR jobId + subtaskId required" }, { status: 400 });
  } catch (error) {
    error({ err: error }, "Create subtask failed");
    return NextResponse.json({ error: "Failed to create subtask" }, { status: 500 });
  }
}
