import { NextRequest, NextResponse } from "next/server";
import { error, info } from "@/lib/logger.server";
import { verifyAuth, extractUserId } from "@/lib/auth";
import { getRawDb } from "@/db/drizzle";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const familyId = url.searchParams.get("familyId");
    if (!familyId) return NextResponse.json({ error: "Family ID is required" }, { status: 400 });

    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (auth.familyId !== familyId) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (auth.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const invites = rawDb.prepare(`SELECT * FROM invites WHERE family_id = ? ORDER BY created_at DESC`).all(familyId) as any[];
    return NextResponse.json({ ok: true, invites: invites || [] });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "List invites failed");
    return NextResponse.json({ error: "Failed to list invites" }, { status: 500 });
  }
}

async function getInviteByCode(code: string) {
  const rawDb = getRawDb();
  if (!rawDb) return null;
  const invite = rawDb.prepare(`SELECT * FROM invites WHERE code = ?`).get(code) as any;
  return invite || null;
}

export async function joinFamily(code: string, request: NextRequest) {
  try {
    if (!code) return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
    const userId = extractUserId(request);
    if (!userId) return NextResponse.json({ error: "You must be logged in to join a family" }, { status: 401 });

    const invite = await getInviteByCode(code);
    if (!invite) return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: "Invite code has expired" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (rawDb) {
      const existingUser = rawDb.prepare(`SELECT family_id FROM users WHERE id = ?`).get(userId) as any;
      if (existingUser?.family_id) return NextResponse.json({ error: "You are already a member of a family" }, { status: 409 });

      const now = new Date().toISOString();
      rawDb.prepare(`UPDATE invites SET used = 1, updated_at = ? WHERE id = ?`).run(now, invite.id);
      rawDb.prepare(`UPDATE users SET family_id = ?, updated_at = ? WHERE id = ?`).run(invite.family_id, now, userId);
    }

    return NextResponse.json({ id: invite.family_id, name: "Family" });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Join family failed");
    return NextResponse.json({ error: "Failed to join family" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return joinFamily(body?.code, request);
}
