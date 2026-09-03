import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { generateInviteCode, isValidInviteCode } from "@/lib/invite-codes";

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!auth.familyId) return NextResponse.json({ error: "User has no family" }, { status: 400 });
    if (auth.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    let code = generateInviteCode();
    let maxRetries = 10;
    while (maxRetries-- > 0) {
      const existing = rawDb.prepare(`SELECT id FROM invites WHERE code = ?`).get(code) as any;
      if (!existing) break;
      code = generateInviteCode();
    }

    if (!isValidInviteCode(code)) return NextResponse.json({ error: "Failed to generate valid invite code" }, { status: 500 });

    const expiresAt = false ? null : new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const inviteId = `invite-${Date.now()}`;

    rawDb.prepare(
      `INSERT INTO invites (id, family_id, code, role, expires_at, used, created_at, updated_at) VALUES (?, ?, ?, 'child', ?, 0, ?, ?)`
    ).run(inviteId, auth.familyId, code, expiresAt, now, now);

    const invite = rawDb.prepare(`SELECT * FROM invites WHERE id = ?`).get(inviteId) as any;
    return NextResponse.json({ ok: true, invite: { ...invite, expires_at: invite?.expires_at || null } });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Generate invite code failed");
    return NextResponse.json({ error: "Failed to generate invite code" }, { status: 500 });
  }
}
