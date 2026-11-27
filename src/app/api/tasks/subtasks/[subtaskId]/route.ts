import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { verifyAuth, canAuthor } from "@/lib/auth";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ subtaskId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const subtaskId = (await params).subtaskId;
    const result = await rawDb.prepare(`DELETE FROM subtasks WHERE id = ? AND household_id = ?`).run(subtaskId, auth.householdId);
    if (result.changes === 0) return NextResponse.json({ error: "Subtask not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Subtask DELETE failed");
    return NextResponse.json({ error: "Failed to delete subtask" }, { status: 500 });
  }
}
