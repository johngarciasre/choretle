import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { verifyAuth, canAuthor } from "@/lib/auth";

async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    let subtasks: any[];
    if (taskId) {
      subtasks = await rawDb.prepare(`SELECT * FROM subtasks WHERE task_id = ? AND household_id = ? ORDER BY "order"`).all(taskId, householdId) as any[];
    } else {
      subtasks = await rawDb.prepare(`SELECT * FROM subtasks WHERE household_id = ? ORDER BY created_at DESC`).all(householdId) as any[];
    }
    return NextResponse.json(subtasks || []);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Subtasks GET failed");
    return NextResponse.json({ error: "Failed to fetch subtasks" }, { status: 500 });
  }
}

async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });

    const body = await request.json();
    const { taskId, name, points } = body;
    if (!taskId || !name) return NextResponse.json({ error: "taskId and name are required" }, { status: 400 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const owned = await rawDb.prepare(`SELECT id FROM tasks WHERE id = ? AND household_id = ?`).get(taskId, householdId);
    if (!owned) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const now = new Date().toISOString();
    const subtaskId = `subtask-${crypto.randomUUID()}`;
    await rawDb.prepare(
      `INSERT INTO subtasks (id, household_id, task_id, name, points, "order", created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`
    ).run(subtaskId, householdId, taskId, name, points || 0, now);

    const result = await rawDb.prepare(`SELECT * FROM subtasks WHERE id = ?`).get(subtaskId) as any;
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Subtask POST failed");
    return NextResponse.json({ error: "Failed to create subtask" }, { status: 500 });
  }
}

async function PUT(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const body = await request.json();
    const { subtaskId, name, points } = body;
    if (!subtaskId) return NextResponse.json({ error: "subtaskId is required" }, { status: 400 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const updates: string[] = [];
    const values: any[] = [];
    if (name !== undefined) { updates.push("name = ?"); values.push(name); }
    if (points !== undefined) { updates.push("points = ?"); values.push(points); }
    if (updates.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    values.push(subtaskId, auth.householdId);

    await rawDb.prepare(`UPDATE subtasks SET ${updates.join(", ")} WHERE id = ? AND household_id = ?`).run(...values);
    const result = await rawDb.prepare(`SELECT * FROM subtasks WHERE id = ? AND household_id = ?`).get(subtaskId, auth.householdId) as any;
    if (!result) return NextResponse.json({ error: "Subtask not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Subtask PUT failed");
    return NextResponse.json({ error: "Failed to update subtask" }, { status: 500 });
  }
}

async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const body = await request.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const result = await rawDb.prepare(`DELETE FROM subtasks WHERE id = ? AND household_id = ?`).run(id, auth.householdId);
    if (result.changes === 0) return NextResponse.json({ error: "Subtask not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Subtask DELETE failed");
    return NextResponse.json({ error: "Failed to delete subtask" }, { status: 500 });
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
