import { NextRequest, NextResponse } from "next/server";
import { getTasksByFamily, createTask, updateTask, deleteTask } from "@/lib/db/service";
import { initDb, rawInsert, rawDeleteWhere } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const tagIds = searchParams.get("tagIds");

    let tasks = await getTasksByFamily(familyId);

    // Filter by tags if provided
    if (tagIds) {
      const tagIdArray = JSON.parse(tagIds);
      tasks = tasks.filter((task: any) => task.tagIds && tagIdArray.some((id: string) => task.tagIds.includes(id)));
    }

    return NextResponse.json(tasks);
  } catch (err) {
    error({ err: err }, "Get tasks failed");
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
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
    const { title, name, description, points, icon, archtype, tagIds, verifyRequired } = body;

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    if (!title && !name) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    // Create task
    const taskId = `task-${Date.now()}`;
    const task = await rawInsert("tasks", {
      id: taskId,
      family_id: familyId,
      name: title || name || "",
      description: description || null,
      points: points || 0,
      icon: icon || null,
      archtype: archtype || "job",
      is_active: true,
      verify_required: verifyRequired ?? false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Handle tags if provided
    if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
      for (const tagId of tagIds) {
        await rawInsert("task_tags", {
          id: `tt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          task_id: taskId,
          tag_id: tagId,
        });
      }
    }

    return NextResponse.json(task);
  } catch (err) {
    error({ err: err }, "Create task failed");
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
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
    const { id, title, name, description, points, icon, archtype, isActive, tagIds, verifyRequired } = body;

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    // Update task fields
    await db.update(schema.tasks)
      .set({
        name: title || name,
        description,
        points,
        icon,
        archtype,
        isActive,
        verifyRequired,
      })
      .where(eq(schema.tasks.id, id));

    // Handle tags if provided
    if (tagIds !== undefined) {
      await rawDeleteWhere("task_tags", [{ col: "task_id", val: id }]);

      if (Array.isArray(tagIds) && tagIds.length > 0) {
        for (const tagId of tagIds) {
          await rawInsert("task_tags", {
            id: `tt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            task_id: id,
            tag_id: tagId,
          });
        }
      }
    }

    // Fetch updated task
    const updatedTask = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);

    return NextResponse.json(updatedTask[0]);
  } catch (err) {
    error({ err: err }, "Update task failed");
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
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
    const { id } = body;

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    // Delete task tags first (cascade via FK constraints in PostgreSQL)
    await rawDeleteWhere("task_tags", [{ col: "task_id", val: id }]);
    await rawDeleteWhere("tasks", [{ col: "id", val: id }]);

    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: err }, "Delete task failed");
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
