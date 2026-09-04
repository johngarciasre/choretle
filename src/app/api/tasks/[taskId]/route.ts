import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) return NextResponse.json({ error: "Family ID required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const taskId = (await params).taskId;

    // Fetch task with tags
    const taskWithTags = rawDb.prepare(
      `SELECT t.*, GROUP_CONCAT(tt.tag_id) as tag_ids FROM tasks t LEFT JOIN task_tags tt ON t.id = tt.task_id WHERE t.id = ? AND t.family_id = ?`
    ).get(taskId, familyId) as any;

    if (!taskWithTags) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const tags = taskWithTags.tag_ids ? taskWithTags.tag_ids.split(",") : [];
    const tagDetails = rawDb.prepare(`SELECT * FROM tags WHERE id IN (${tags.map(() => "?").join(",")})`).all(...tags) as any[];

    // Fetch subtasks
    const subtasks = rawDb.prepare(`SELECT * FROM subtasks WHERE task_id = ? ORDER BY "order"`).all(taskId) as any[];

    return NextResponse.json({
      id: taskWithTags.id, name: taskWithTags.name, description: taskWithTags.description,
      points: taskWithTags.points || 0, icon: taskWithTags.icon, archtype: taskWithTags.archtype,
      verifyRequired: !!taskWithTags.verify_required, tagIds: tags,
      tags: (tagDetails || []).map((t: any) => ({ id: t.id, name: t.name, color: t.color })),
      subtasks: (subtasks || []).map((s: any) => ({
        id: s.id, name: s.name, points: s.points || 0, order: s.order,
      })),
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Task GET failed");
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) return NextResponse.json({ error: "Family ID required" }, { status: 400 });

    const body = await request.json();
    const { name, description, points, icon, tags, verifyRequired } = body;
    const taskId = (await params).taskId;

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    // Normalize tag field name — accept both 'tags' and 'tagIds' from client
    const resolvedTags = tags ?? body.tagIds;

    // Update task
    const updates: string[] = ["name = ?", "description = ?", "points = ?", "icon = ?", "verify_required = ?", "updated_at = ?"];
    const values: any[] = [name || "", description || null, points || 0, icon || null, verifyRequired ? 1 : 0, new Date().toISOString()];
    values.push(taskId);
    rawDb.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    // Update tags if provided
    if (resolvedTags !== undefined) {
      rawDb.prepare(`DELETE FROM task_tags WHERE task_id = ?`).run(taskId);
      for (const tagId of (resolvedTags || [])) {
        rawDb.prepare(`INSERT INTO task_tags (id, task_id, tag_id) VALUES (?, ?, ?)`).run(`tt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, taskId, tagId);
      }
    }

    // Fetch updated task with tags
    const updatedTaskWithTags = rawDb.prepare(
      `SELECT t.*, GROUP_CONCAT(tt.tag_id) as tag_ids FROM tasks t LEFT JOIN task_tags tt ON t.id = tt.task_id WHERE t.id = ?`
    ).get(taskId) as any;

    const tagIds = updatedTaskWithTags?.tag_ids ? updatedTaskWithTags.tag_ids.split(",") : [];
    const tagDetails = rawDb.prepare(`SELECT * FROM tags WHERE id IN (${tagIds.map(() => "?").join(",")})`).all(...tagIds) as any[];

    return NextResponse.json({
      id: updatedTaskWithTags.id, name: updatedTaskWithTags.name, description: updatedTaskWithTags.description,
      points: updatedTaskWithTags.points || 0, icon: updatedTaskWithTags.icon,
      verifyRequired: !!updatedTaskWithTags.verify_required, tagIds: tagIds,
      tags: (tagDetails || []).map((t: any) => ({ id: t.id, name: t.name, color: t.color })),
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Task PUT failed");
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const taskId = (await params).taskId;
    rawDb.prepare(`DELETE FROM task_tags WHERE task_id = ?`).run(taskId);
    rawDb.prepare(`DELETE FROM subtasks WHERE task_id = ?`).run(taskId);
    rawDb.prepare(`UPDATE tasks SET is_active = 0 WHERE id = ?`).run(taskId);

    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Task DELETE failed");
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
