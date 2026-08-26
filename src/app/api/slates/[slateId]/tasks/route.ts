import { NextRequest, NextResponse } from "next/server";
import { initDb, rawInsert, rawDeleteWhere } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { error } from "@/lib/logger.server";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const slateId = (await params).slateId;
    const body = await request.json();
    const { taskIds, pointsOverrides, orders } = body;

    // Delete existing slate tasks for this slate
    await rawDeleteWhere("slate_tasks", [{ col: "slate_id", val: slateId }]);

    if (!taskIds || taskIds.length === 0) {
      return NextResponse.json({ success: true });
    }

    // Insert new slate tasks
    for (let i = 0; i < taskIds.length; i++) {
      await rawInsert("slate_tasks", {
        id: `stask-${Date.now()}-${i}`,
        slate_id: slateId,
        task_id: taskIds[i],
        points_override: pointsOverrides?.[i] ?? null,
        "order": orders?.[i] ?? i,
      });
    }

    return NextResponse.json({ success: true, count: taskIds.length });
  } catch (err) {
    error({ err: err }, "Slate tasks PUT failed");
    return NextResponse.json({ error: "Failed to update slate tasks" }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const slateId = (await params).slateId;

    const tasks = await db.select({
      slateTask: schema.slateTasks,
      task: schema.tasks,
    })
      .from(schema.slateTasks)
      .leftJoin(schema.tasks, eq(schema.slateTasks.taskId, schema.tasks.id))
      .where(eq(schema.slateTasks.slateId, slateId));

    return NextResponse.json(tasks);
  } catch (err) {
    error({ err: err }, "Slate tasks GET failed");
    return NextResponse.json({ error: "Failed to fetch slate tasks" }, { status: 500 });
  }
}
