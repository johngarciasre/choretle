import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { verifyAuth, canAuthor } from "@/lib/auth";

async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const taskId = (await params).taskId;

    // Fetch task with tags
    const taskWithTags = await rawDb.prepare(
      `SELECT t.*, (SELECT string_agg(tt.tag_id, ',') FROM task_tags tt WHERE tt.task_id = t.id) as tag_ids FROM tasks t WHERE t.id = ? AND t.household_id = ?`
    ).get(taskId, householdId) as any;

    if (!taskWithTags) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const tags = taskWithTags.tag_ids ? taskWithTags.tag_ids.split(",") : [];
    const tagDetails = tags.length
      ? ((await rawDb
          .prepare(`SELECT * FROM tags WHERE id IN (${tags.map(() => "?").join(",")}) AND household_id = ?`)
          .all(...tags, householdId)) as any[])
      : [];

    // Fetch subtasks
    const subtasks = await rawDb.prepare(`SELECT * FROM subtasks WHERE task_id = ? ORDER BY "order"`).all(taskId) as any[];

    return NextResponse.json({
      id: taskWithTags.id, name: taskWithTags.name, description: taskWithTags.description,
      points: taskWithTags.points || 0, icon: taskWithTags.icon, archtype: taskWithTags.archtype,
      verifyRequired: !!taskWithTags.verify_required, tagIds: tags, schedule: taskWithTags.schedule,
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

async function PUT(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });

    const body = await request.json();
    const { name, description, points, icon, tags, verifyRequired, schedule } = body;
    const taskId = (await params).taskId;

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const owned = await rawDb.prepare(`SELECT id FROM tasks WHERE id = ? AND household_id = ?`).get(taskId, householdId);
    if (!owned) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    // Normalize tag field name — accept both 'tags' and 'tagIds' from client
    const resolvedTags = tags ?? body.tagIds;

    // Tags come from the request body, so they must be proven to be ours.
    for (const tagId of Array.isArray(resolvedTags) ? resolvedTags : []) {
      if (!await rawDb.prepare(`SELECT id FROM tags WHERE id = ? AND household_id = ?`).get(tagId, householdId)) {
        return NextResponse.json({ error: "Tag not found" }, { status: 404 });
      }
    }

    // Update task
    const updates: string[] = ["name = ?", "description = ?", "points = ?", "icon = ?", "verify_required = ?", "schedule = ?", "updated_at = ?"];
    const scheduleStr = typeof schedule === "string" ? schedule : JSON.stringify(schedule);
    const values: any[] = [name || "", description || null, points || 0, icon || null, verifyRequired ? 1 : 0, scheduleStr || null, new Date().toISOString()];
    values.push(taskId, householdId);
    await rawDb.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ? AND household_id = ?`).run(...values);

    // Update tags if provided
    if (resolvedTags !== undefined) {
      await rawDb.prepare(`DELETE FROM task_tags WHERE task_id = ?`).run(taskId);
      for (const tagId of (resolvedTags || [])) {
        await rawDb.prepare(`INSERT INTO task_tags (id, task_id, tag_id) VALUES (?, ?, ?)`).run(`tt-${crypto.randomUUID()}`, taskId, tagId);
      }
    }

    // Fetch updated task with tags
    const updatedTaskWithTags = await rawDb.prepare(
      `SELECT t.*, (SELECT string_agg(tt.tag_id, ',') FROM task_tags tt WHERE tt.task_id = t.id) as tag_ids FROM tasks t WHERE t.id = ?`
    ).get(taskId) as any;

    const tagIds = updatedTaskWithTags?.tag_ids ? updatedTaskWithTags.tag_ids.split(",") : [];
    const tagDetails = tagIds.length
      ? ((await rawDb
          .prepare(`SELECT * FROM tags WHERE id IN (${tagIds.map(() => "?").join(",")}) AND household_id = ?`)
          .all(...tagIds, householdId)) as any[])
      : [];

    return NextResponse.json({
      id: updatedTaskWithTags.id, name: updatedTaskWithTags.name, description: updatedTaskWithTags.description,
      points: updatedTaskWithTags.points || 0, icon: updatedTaskWithTags.icon,
      verifyRequired: !!updatedTaskWithTags.verify_required, tagIds: tagIds, schedule: updatedTaskWithTags.schedule,
      tags: (tagDetails || []).map((t: any) => ({ id: t.id, name: t.name, color: t.color })),
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Task PUT failed");
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

async function DELETE(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const taskId = (await params).taskId;

    // Verify task exists and belongs to household before deleting
    const task = await rawDb.prepare(`SELECT id FROM tasks WHERE id = ? AND household_id = ?`).get(taskId, householdId);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    await rawDb.prepare(`DELETE FROM task_tags WHERE task_id = ? AND EXISTS (SELECT 1 FROM tasks WHERE id = ? AND household_id = ?)`).run(taskId, taskId, householdId);
    await rawDb.prepare(`DELETE FROM subtasks WHERE task_id = ? AND EXISTS (SELECT 1 FROM tasks WHERE id = ? AND household_id = ?)`).run(taskId, taskId, householdId);
    await rawDb.prepare(`DELETE FROM tasks WHERE id = ? AND household_id = ?`).run(taskId, householdId);

    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Task DELETE failed");
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
const PUT_impl = withTenant(PUT);
export { PUT_impl as PUT };
const DELETE_impl = withTenant(DELETE);
export { DELETE_impl as DELETE };
