import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) return NextResponse.json({ error: "Family ID required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    let subtasks: any[];
    if (taskId) {
      subtasks = rawDb.prepare(`SELECT * FROM subtasks WHERE task_id = ? AND family_id = ? ORDER BY "order"`).all(taskId, familyId) as any[];
    } else {
      subtasks = rawDb.prepare(`SELECT * FROM subtasks WHERE family_id = ? ORDER BY created_at DESC`).all(familyId) as any[];
    }
    return NextResponse.json(subtasks || []);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Subtasks GET failed");
    return NextResponse.json({ error: "Failed to fetch subtasks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) return NextResponse.json({ error: "Family ID required" }, { status: 400 });

    const body = await request.json();
    const { taskId, name, points } = body;
    if (!taskId || !name) return NextResponse.json({ error: "taskId and name are required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const now = new Date().toISOString();
    const subtaskId = `subtask-${Date.now()}`;
    rawDb.prepare(
      `INSERT INTO subtasks (id, family_id, task_id, name, points, "order", created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`
    ).run(subtaskId, familyId, taskId, name, points || 0, now);

    const result = rawDb.prepare(`SELECT * FROM subtasks WHERE id = ?`).get(subtaskId) as any;
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Subtask POST failed");
    return NextResponse.json({ error: "Failed to create subtask" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const body = await request.json();
    const { subtaskId, name, points } = body;
    if (!subtaskId) return NextResponse.json({ error: "subtaskId is required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const updates: string[] = [];
    const values: any[] = [];
    if (name !== undefined) { updates.push("name = ?"); values.push(name); }
    if (points !== undefined) { updates.push("points = ?"); values.push(points); }
    updates.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(subtaskId);

    rawDb.prepare(`UPDATE subtasks SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    const result = rawDb.prepare(`SELECT * FROM subtasks WHERE id = ?`).get(subtaskId) as any;
    return NextResponse.json(result);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Subtask PUT failed");
    return NextResponse.json({ error: "Failed to update subtask" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    rawDb.prepare(`DELETE FROM subtasks WHERE id = ?`).run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Subtask DELETE failed");
    return NextResponse.json({ error: "Failed to delete subtask" }, { status: 500 });
  }
}
