import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, canAuthor } from "@/lib/auth";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { generateInviteCode, isValidInviteCode } from "@/lib/invite-codes";

async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!auth.householdId) return NextResponse.json({ error: "User has no household" }, { status: 400 });
    if (!canAuthor(auth)) return NextResponse.json({ error: "Parent access required" }, { status: 403 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    let code = generateInviteCode();
    let maxRetries = 10;
    while (maxRetries-- > 0) {
      const existing = await rawDb.prepare(`SELECT id FROM invites WHERE code = ?`).get(code) as any;
      if (!existing) break;
      code = generateInviteCode();
    }

    if (!isValidInviteCode(code)) return NextResponse.json({ error: "Failed to generate valid invite code" }, { status: 500 });

    const expiresAt = false ? null : new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const inviteId = `invite-${crypto.randomUUID()}`;

    await rawDb.prepare(
      `INSERT INTO invites (id, household_id, code, role, expires_at, used, created_at, updated_at) VALUES (?, ?, ?, 'child', ?, 0, ?, ?)`
    ).run(inviteId, auth.householdId, code, expiresAt, now, now);

    const invite = await rawDb.prepare(`SELECT * FROM invites WHERE id = ?`).get(inviteId) as any;
    return NextResponse.json({ ok: true, invite: { ...invite, expires_at: invite?.expires_at || null } });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Generate invite code failed");
    return NextResponse.json({ error: "Failed to generate invite code" }, { status: 500 });
  }
}

const POST_impl = withTenant(POST);
export { POST_impl as POST };
