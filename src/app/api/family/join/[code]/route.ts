import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const auth = verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const userRows = rawDb.prepare(`SELECT role FROM users WHERE id = ?`).get(auth.userId) as any;
    if (!userRows || userRows.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

    const invites = rawDb.prepare(`SELECT * FROM invites WHERE code = ?`).get(code) as any;
    if (!invites) return NextResponse.json({ error: "Invite code not found" }, { status: 404 });
    if (invites.family_id !== auth.familyId) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    rawDb.prepare(`DELETE FROM invites WHERE id = ?`).run(invites.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Invalidate invite code failed");
    return NextResponse.json({ error: "Failed to invalidate invite code" }, { status: 500 });
  }
}
