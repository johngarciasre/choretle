import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, canAuthor } from "@/lib/auth";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";

async function DELETE(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!canAuthor(auth)) return NextResponse.json({ error: "Parent access required" }, { status: 403 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const invites = await rawDb.prepare(`SELECT * FROM invites WHERE code = ?`).get(code) as any;
    if (!invites) return NextResponse.json({ error: "Invite code not found" }, { status: 404 });
    if (invites.household_id !== auth.householdId) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    await rawDb.prepare(`DELETE FROM invites WHERE id = ?`).run(invites.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Invalidate invite code failed");
    return NextResponse.json({ error: "Failed to invalidate invite code" }, { status: 500 });
  }
}

const DELETE_impl = withTenant(DELETE);
export { DELETE_impl as DELETE };
