import { NextRequest, NextResponse } from "next/server";
import { getTasksByFamily, createTask, updateTask, deleteTask } from "@/lib/db/service";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { error } from "@/lib/logger.server";

export async function GET(request: NextRequest) {
  try {
    const familyId = request.headers.get("x-family-id") || new URL(request.url).searchParams.get("familyId");
    if (!familyId) return NextResponse.json([]);

    const searchParams = request.nextUrl.searchParams;
    const tagIds = searchParams.get("tagIds");

    let tasks = await getTasksByFamily(familyId);

    // Filter by tags if provided
    if (tagIds) {
      const tagIdArray = JSON.parse(tagIds);
      tasks = tasks.filter((task: any) => task.tagIds && tagIdArray.some((id: string) => task.tagIds.includes(id)));
    }

    return NextResponse.json(tasks);
  } catch (error) {
    error({ err: error }, "Get tasks failed");
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const body = await request.json();
    const { title, name, description, points, icon, archtype, tagIds, verifyRequired } = body;

    const familyId = request.headers.get("x-family-id") || new URL(request.url).searchParams.get("familyId");
    if (!familyId || !title && !name) {
      return NextResponse.json({ error: "familyId and title are required" }, { status: 400 });
    }

    // Create task
    const task = await db.insert(schema.tasks).values({
      familyId,
      name: title || name || "",
      description: description || null,
      points: points || 0,
      icon: icon || null,
      archtype: archtype || "job",
      isActive: true,
      verifyRequired: verifyRequired ?? false,
    }).returning("*");

    // Handle tags if provided
    if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
      const insertValues = tagIds.map((tagId: string) => ({ taskId: task[0].id, tagId }));
      await db.insert(schema.taskTags).values(insertValues);
    }

    return NextResponse.json(task[0]);
  } catch (error) {
    error({ err: error }, "Create task failed");
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const body = await request.json();
    const { id, title, name, description, points, icon, archtype, isActive, tagIds, verifyRequired } = body;

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
      await db.delete(schema.taskTags).where({ taskId: id });
      
      if (Array.isArray(tagIds) && tagIds.length > 0) {
        const insertValues = tagIds.map((tagId: string) => ({ taskId: id, tagId }));
        await db.insert(schema.taskTags).values(insertValues);
      }
    }

    // Fetch updated task
    const updatedTask = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
    
    return NextResponse.json(updatedTask[0]);
  } catch (error) {
    error({ err: error }, "Update task failed");
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    // Delete task tags first (cascade via FK constraints in PostgreSQL)
    await db.delete(schema.taskTags).where({ taskId: id });
    await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    error({ err: error }, "Delete task failed");
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
