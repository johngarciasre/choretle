import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ photoId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const photoId = (await params).photoId;
    const result = rawDb.prepare(`DELETE FROM photos WHERE id = ? AND family_id = ?`).run(photoId, auth.familyId);
    if (result.changes === 0) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Delete photo failed");
    return NextResponse.json({ error: "Failed to delete photo" }, { status: 500 });
  }
}
