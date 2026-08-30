import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const slateId = (await params).slateId;
    const body = await request.json();
    const { taskIds, pointsOverrides, orders } = body;

    // Delete existing slate tasks for this slate
    rawDb.prepare(`DELETE FROM slate_tasks WHERE slate_id = ?`).run(slateId);

    if (!taskIds || taskIds.length === 0) {
      return NextResponse.json({ success: true });
    }

    // Insert new slate tasks
    const insertStmt = rawDb.prepare(
      `INSERT INTO slate_tasks (id, slate_id, task_id, points_override, "order") VALUES (?, ?, ?, ?, ?)`
    );

    for (let i = 0; i < taskIds.length; i++) {
      insertStmt.run(
        `stask-${Date.now()}-${i}`,
        slateId,
        taskIds[i],
        pointsOverrides?.[i] ?? null,
        orders?.[i] ?? i,
      );
    }

    return NextResponse.json({ success: true, count: taskIds.length });
  } catch (err) {
    error({ err: err }, "Slate tasks PUT failed");
    return NextResponse.json({ error: "Failed to update slate tasks" }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const slateId = (await params).slateId;

    // Get explicit tasks for this slate using raw SQL
    const slateTasks = rawDb.prepare(`
      SELECT st.id as slate_task_id, st.task_id, t.id as task_id, t.name, t.description, t.points
      FROM slate_tasks st
      LEFT JOIN tasks t ON st.task_id = t.id
      WHERE st.slate_id = ?
      ORDER BY st."order"
    `).all(slateId) as any[];

    const explicitTaskIds = slateTasks.map((st: any) => st.task_id);

    return NextResponse.json({
      tasks: slateTasks.map((st: any) => ({
        id: st.task_id,
        name: st.name,
        description: st.description,
        points: st.points || 0,
        tagIds: [],
      })),
      explicitTaskIds,
      autoIncludeTagIds: [],
    });
  } catch (err) {
    error({ err: err }, "Slate tasks GET failed");
    return NextResponse.json({ error: "Failed to fetch slate tasks" }, { status: 500 });
  }
}
