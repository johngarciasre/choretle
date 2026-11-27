import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { verifyAuth, canAuthor } from "@/lib/auth";

async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const householdId = auth.householdId;
    if (!householdId) {
      return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    }

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const searchParams = request.nextUrl.searchParams;
    const tagIds = searchParams.get("tagIds");

    // Get tasks with their tags using raw SQL (Drizzle ORM fails on SQLite)
    const tasks = await rawDb.prepare(
      `SELECT t.*, (SELECT string_agg(tt.tag_id, ',') FROM task_tags tt WHERE tt.task_id = t.id) as tag_ids FROM tasks t WHERE t.household_id = ?`
    ).all(householdId) as any[];

    // Enrich each task with tagIds array
    const enrichedTasks = tasks.map((task: any) => ({
      ...task,
      tagIds: task.tag_ids ? task.tag_ids.split(",") : [],
    }));

    // Filter by tags if provided
    if (tagIds) {
      const tagIdArray = JSON.parse(tagIds);
      return NextResponse.json(enrichedTasks.filter((task: any) => task.tagIds && tagIdArray.some((id: string) => task.tagIds.includes(id))));
    }

    return NextResponse.json(enrichedTasks);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Get tasks failed");
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const body = await request.json();
    const { title, name, description, points, icon, archtype, tagIds, verifyRequired, schedule } = body;

    const householdId = auth.householdId;
    if (!householdId) {
      return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    }

    if (!title && !name) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Tags come from the request body, so they must be proven to be ours.
    for (const tagId of Array.isArray(tagIds) ? tagIds : []) {
      if (!await rawDb.prepare(`SELECT id FROM tags WHERE id = ? AND household_id = ?`).get(tagId, householdId)) {
        return NextResponse.json({ error: "Tag not found" }, { status: 404 });
      }
    }

    // Create task
    const taskId = `task-${crypto.randomUUID()}`;
    const scheduleStr = typeof schedule === "string" ? schedule : JSON.stringify(schedule);
    await rawDb.prepare(
      `INSERT INTO tasks (id, household_id, name, description, points, icon, archtype, is_active, verify_required, schedule, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      taskId,
      householdId,
      title || name || "",
      description || null,
      points || 0,
      icon || null,
      archtype || "job",
      1,
      verifyRequired ? 1 : 0,
      scheduleStr || null,
      new Date().toISOString(),
      new Date().toISOString(),
    );

    // Handle tags if provided
    if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
      for (const tagId of tagIds) {
        await rawDb.prepare(
          `INSERT INTO task_tags (id, task_id, tag_id) VALUES (?, ?, ?)`
        ).run(
          `tt-${crypto.randomUUID()}`,
          taskId,
          tagId,
        );
      }
    }

    const task = await rawDb.prepare(`SELECT * FROM tasks WHERE id = ?`).get(taskId) as any;

    return NextResponse.json(task);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Create task failed");
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

async function PUT(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const body = await request.json();
    const { id, title, name, description, points, icon, archtype, isActive, tagIds, verifyRequired, schedule } = body;

    const householdId = auth.householdId;
    if (!householdId) {
      return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    }

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const owned = await rawDb.prepare(`SELECT id FROM tasks WHERE id = ? AND household_id = ?`).get(id, householdId);
    if (!owned) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    // Tags come from the request body, so they must be proven to be ours.
    for (const tagId of Array.isArray(tagIds) ? tagIds : []) {
      if (!await rawDb.prepare(`SELECT id FROM tags WHERE id = ? AND household_id = ?`).get(tagId, householdId)) {
        return NextResponse.json({ error: "Tag not found" }, { status: 404 });
      }
    }

    // Update task fields
    const scheduleStr = typeof schedule === "string" ? schedule : JSON.stringify(schedule);
    await rawDb.prepare(
      `UPDATE tasks SET name = ?, description = ?, points = ?, icon = ?, archtype = ?, is_active = ?, verify_required = ?, schedule = ? WHERE id = ? AND household_id = ?`
    ).run(
      title || name,
      description || null,
      points,
      icon || null,
      archtype,
      isActive !== false ? 1 : 0,
      verifyRequired ? 1 : 0,
      scheduleStr || null,
      id,
      householdId,
    );

    // Handle tags if provided
    if (tagIds !== undefined) {
      await rawDb.prepare(`DELETE FROM task_tags WHERE task_id = ?`).run(id);

      if (Array.isArray(tagIds) && tagIds.length > 0) {
        for (let i = 0; i < tagIds.length; i++) {
          await rawDb.prepare(
            `INSERT INTO task_tags (id, task_id, tag_id) VALUES (?, ?, ?)`
          ).run(
            `tt-${crypto.randomUUID()}`,
            id,
            tagIds[i],
          );
        }
      }
    }

    // Fetch updated task
    const updatedTask = await rawDb.prepare(`SELECT * FROM tasks WHERE id = ? AND household_id = ?`).get(id, householdId) as any;

    return NextResponse.json(updatedTask);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Update task failed");
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const householdId = auth.householdId;
    if (!householdId) {
      return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Delete task tags first (cascade via FK constraints in PostgreSQL)
    await rawDb.prepare(`DELETE FROM task_tags WHERE task_id = ? AND EXISTS (SELECT 1 FROM tasks WHERE id = ? AND household_id = ?)`).run(id, id, householdId);
    await rawDb.prepare(`DELETE FROM tasks WHERE id = ? AND household_id = ?`).run(id, householdId);

    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Delete task failed");
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
const POST_impl = withTenant(POST);
export { POST_impl as POST };
const PUT_impl = withTenant(PUT);
export { PUT_impl as PUT };
const DELETE_impl = withTenant(DELETE);
export { DELETE_impl as DELETE };
