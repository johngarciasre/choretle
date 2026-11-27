import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { verifyAuth, canAuthor } from "@/lib/auth";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ rotationId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const rotationId = (await params).rotationId;
    const result = await rawDb.prepare(
      `DELETE FROM rotations WHERE id = ? AND slate_id IN (SELECT id FROM slates WHERE household_id = ?)`
    ).run(rotationId, auth.householdId);

    if (result.changes === 0) return NextResponse.json({ error: "Rotation not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Rotation DELETE failed");
    return NextResponse.json({ error: "Failed to delete rotation" }, { status: 500 });
  }
}
