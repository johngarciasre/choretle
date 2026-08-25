import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { error } from "@/lib/logger";

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const taskId = (await params).taskId;
    
    // Get task with tags
    const taskWithTags = await db.select({
      task: schema.tasks,
      tagIds: sql<string[]>`GROUP_CONCAT(${schema.taskTags.tagId})`,
    })
      .from(schema.tasks)
      .leftJoin(schema.taskTags, eq(schema.tasks.id, schema.taskTags.taskId))
      .where(eq(schema.tasks.id, taskId))
      .limit(1);

    if (!taskWithTags || !taskWithTags[0]) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const result = taskWithTags[0].tagIds ? JSON.parse(taskWithTags[0].tagIds) : [];

    return NextResponse.json({
      ...taskWithTags[0].task,
      tagIds: result,
      verifyRequired: taskWithTags[0].task.verifyRequired ?? false,
    });
  } catch (error) {
    error({ err: error }, "Task GET failed");
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const taskId = (await params).taskId;
    const body = await request.json();
    const { name, description, points, icon, archtype, isActive, tagIds, verifyRequired } = body;

    // Update task fields
    await db.update(schema.tasks)
      .set({ name, description, points, icon, archtype, isActive, verifyRequired })
      .where(eq(schema.tasks.id, taskId));

    // Handle tags
    if (tagIds !== undefined) {
      await db.delete(schema.taskTags).where({ taskId });
      
      if (Array.isArray(tagIds) && tagIds.length > 0) {
        const insertValues = tagIds.map((tagId: string) => ({ taskId, tagId }));
        await db.insert(schema.taskTags).values(insertValues);
      }
    }

    // Fetch updated task with tags
    const updatedTaskWithTags = await db.select({
      task: schema.tasks,
      tagIds: sql<string[]>`GROUP_CONCAT(${schema.taskTags.tagId})`,
    })
      .from(schema.tasks)
      .leftJoin(schema.taskTags, eq(schema.tasks.id, schema.taskTags.taskId))
      .where(eq(schema.tasks.id, taskId))
      .limit(1);

    if (!updatedTaskWithTags || !updatedTaskWithTags[0]) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const result = updatedTaskWithTags[0].tagIds ? JSON.parse(updatedTaskWithTags[0].tagIds) : [];

    return NextResponse.json({
      ...updatedTaskWithTags[0].task,
      tagIds: result,
    });
  } catch (error) {
    error({ err: error }, "Task PUT failed");
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const taskId = (await params).taskId;
    
    await db.delete(schema.tasks).where(eq(schema.tasks.id, taskId));
    
    // Cascade delete of tags handled by FK constraint
    return NextResponse.json({ success: true });
  } catch (error) {
    error({ err: error }, "Task DELETE failed");
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
