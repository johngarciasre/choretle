import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ rotationId: string }> }) {
  try {
    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });
    const rotationId = (await params).rotationId;
    rawDb.prepare(`DELETE FROM rotations WHERE id = ?`).run(rotationId);
    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Rotation DELETE failed");
    return NextResponse.json({ error: "Failed to delete rotation" }, { status: 500 });
  }
}
