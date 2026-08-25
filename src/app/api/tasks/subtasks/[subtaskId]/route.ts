import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { error } from "@/lib/logger";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ subtaskId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const subtaskId = (await params).subtaskId;
    const body = await request.json();
    const familyId = request.headers.get("x-family-id") || new URL(request.url).searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.points !== undefined) updateData.points = body.points;
    if (body.order !== undefined) updateData.order = body.order;
    if (body.taskId !== undefined) updateData.taskId = body.taskId;

    const result = await db.update(schema.subtasks).set(updateData).where(and(eq(schema.subtasks.id, subtaskId), eq(schema.subtasks.familyId, familyId))).returning("*");

    if (!result || !result[0]) {
      return NextResponse.json({ error: "Subtask not found" }, { status: 404 });
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    error({ err: error }, "Update subtask failed");
    return NextResponse.json({ error: "Failed to update subtask" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ subtaskId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const subtaskId = (await params).subtaskId;
    const familyId = request.headers.get("x-family-id") || new URL(request.url).searchParams.get("familyId");

    await db.delete(schema.jobSubtasks).where(eq(schema.jobSubtasks.subtaskId, subtaskId));
    if (familyId) {
      await db.delete(schema.subtasks).where(and(eq(schema.subtasks.id, subtaskId), eq(schema.subtasks.familyId, familyId)));
    } else {
      await db.delete(schema.subtasks).where(eq(schema.subtasks.id, subtaskId));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    error({ err: error }, "Delete subtask failed");
    return NextResponse.json({ error: "Failed to delete subtask" }, { status: 500 });
  }
}
