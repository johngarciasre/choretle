import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const searchParams = request.nextUrl.searchParams;
    const tagIds = searchParams.get("tagIds");

    // Get tasks with their tags using raw SQL (Drizzle ORM fails on SQLite)
    const tasks = rawDb.prepare(
      `SELECT t.*, GROUP_CONCAT(tt.tag_id) as tag_ids FROM tasks t LEFT JOIN task_tags tt ON t.id = tt.task_id WHERE t.family_id = ? GROUP BY t.id`
    ).all(familyId) as any[];

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

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { title, name, description, points, icon, archtype, tagIds, verifyRequired } = body;

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    if (!title && !name) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Create task
    const taskId = `task-${Date.now()}`;
    rawDb.prepare(
      `INSERT INTO tasks (id, family_id, name, description, points, icon, archtype, is_active, verify_required, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      taskId,
      familyId,
      title || name || "",
      description || null,
      points || 0,
      icon || null,
      archtype || "job",
      1,
      verifyRequired ? 1 : 0,
      new Date().toISOString(),
      new Date().toISOString(),
    );

    // Handle tags if provided
    if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
      for (let i = 0; i < tagIds.length; i++) {
        rawDb.prepare(
          `INSERT INTO task_tags (id, task_id, tag_id) VALUES (?, ?, ?)`
        ).run(
          `tt-${Date.now()}-${i}`,
          taskId,
          tagIds[i],
        );
      }
    }

    const task = rawDb.prepare(`SELECT * FROM tasks WHERE id = ?`).get(taskId) as any;

    return NextResponse.json(task);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Create task failed");
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { id, title, name, description, points, icon, archtype, isActive, tagIds, verifyRequired } = body;

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Update task fields
    rawDb.prepare(
      `UPDATE tasks SET name = ?, description = ?, points = ?, icon = ?, archtype = ?, is_active = ?, verify_required = ? WHERE id = ?`
    ).run(
      title || name,
      description || null,
      points,
      icon || null,
      archtype,
      isActive !== false ? 1 : 0,
      verifyRequired ? 1 : 0,
      id,
    );

    // Handle tags if provided
    if (tagIds !== undefined) {
      rawDb.prepare(`DELETE FROM task_tags WHERE task_id = ?`).run(id);

      if (Array.isArray(tagIds) && tagIds.length > 0) {
        for (let i = 0; i < tagIds.length; i++) {
          rawDb.prepare(
            `INSERT INTO task_tags (id, task_id, tag_id) VALUES (?, ?, ?)`
          ).run(
            `tt-${Date.now()}-${i}`,
            id,
            tagIds[i],
          );
        }
      }
    }

    // Fetch updated task
    const updatedTask = rawDb.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as any;

    return NextResponse.json(updatedTask);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Update task failed");
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Delete task tags first (cascade via FK constraints in PostgreSQL)
    rawDb.prepare(`DELETE FROM task_tags WHERE task_id = ?`).run(id);
    rawDb.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Delete task failed");
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
