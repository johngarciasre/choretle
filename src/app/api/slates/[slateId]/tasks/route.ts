import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { verifyAuth } from "@/lib/auth";
import { error } from "@/lib/logger.server";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const slateId = (await params).slateId;
    const body = await request.json();
    const { explicitTaskIds, autoIncludeTagIds } = body as { explicitTaskIds?: string[]; autoIncludeTagIds?: string[] };

    // Delete existing slate tasks for this slate
    rawDb.prepare(`DELETE FROM slate_tasks WHERE slate_id = ?`).run(slateId);

    if (explicitTaskIds) {
      // Insert new slate tasks with deterministic IDs
      const insertStmt = rawDb.prepare(
        `INSERT INTO slate_tasks (id, slate_id, task_id, points_override, "order") VALUES (?, ?, ?, ?, ?)`
      );

      for (let i = 0; i < explicitTaskIds.length; i++) {
        insertStmt.run(
          `stask-${slateId}-${i}`,
          slateId,
          explicitTaskIds[i],
          null,
          i,
        );
      }
    }

    // Update auto-include tag associations
    rawDb.prepare(`DELETE FROM slate_tags WHERE slate_id = ?`).run(slateId);
    if (autoIncludeTagIds && autoIncludeTagIds.length > 0) {
      const insertTagStmt = rawDb.prepare(
        `INSERT INTO slate_tags (id, slate_id, tag_id) VALUES (?, ?, ?)`
      );
      for (const tagId of autoIncludeTagIds) {
        insertTagStmt.run(`stag-${slateId}-${tagId}`, slateId, tagId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: err }, "Slate tasks PUT failed");
    return NextResponse.json({ error: "Failed to update slate tasks" }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

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

    // Get auto-include tag associations
    const slateTags = rawDb.prepare(
      `SELECT tag_id FROM slate_tags WHERE slate_id = ?`
    ).all(slateId) as any[];
    const autoIncludeTagIds = (slateTags || []).map((t: any) => t.tag_id);

    return NextResponse.json({
      tasks: slateTasks.map((st: any) => ({
        id: st.task_id,
        name: st.name,
        description: st.description,
        points: st.points || 0,
        tagIds: [],
      })),
      explicitTaskIds,
      autoIncludeTagIds,
    });
  } catch (err) {
    error({ err: err }, "Slate tasks GET failed");
    return NextResponse.json({ error: "Failed to fetch slate tasks" }, { status: 500 });
  }
}
