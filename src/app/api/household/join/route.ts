import { NextRequest, NextResponse } from "next/server";
import { error } from "@/lib/logger.server";
import { verifyAuth, extractUserId, canAuthor } from "@/lib/auth";
import { getDb } from "@/db";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const householdId = url.searchParams.get("householdId");
    if (!householdId) return NextResponse.json({ error: "Household ID is required" }, { status: 400 });

    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (auth.householdId !== householdId) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (!canAuthor(auth)) return NextResponse.json({ error: "Parent access required" }, { status: 403 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const invites = await rawDb.prepare(`SELECT * FROM invites WHERE household_id = ? ORDER BY created_at DESC`).all(householdId) as any[];
    return NextResponse.json({ ok: true, invites: invites || [] });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "List invites failed");
    return NextResponse.json({ error: "Failed to list invites" }, { status: 500 });
  }
}

async function getInviteByCode(code: string) {
  const rawDb = getDb();
  if (!rawDb) return null;
  const invite = await rawDb.prepare(`SELECT * FROM invites WHERE code = ?`).get(code) as any;
  return invite || null;
}

export async function joinHousehold(code: string, request: NextRequest) {
  try {
    if (!code) return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
    const userId = await extractUserId(request);
    if (!userId) return NextResponse.json({ error: "You must be logged in to join a household" }, { status: 401 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    // A header/cookie identity is only usable when it maps to a real account.
    const account = await rawDb.prepare(`SELECT id FROM users WHERE id = ?`).get(userId) as any;
    if (!account) return NextResponse.json({ error: "You must be logged in to join a household" }, { status: 401 });

    const invite = await getInviteByCode(code);
    if (!invite) return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
    if (invite.used) return NextResponse.json({ error: "This invite has already been used" }, { status: 400 });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: "Invite code has expired" }, { status: 400 });
    }

    const existingUser = await rawDb.prepare(`SELECT household_id FROM memberships WHERE user_id = ?`).get(userId) as any;
    if (existingUser?.household_id) return NextResponse.json({ error: "You are already a member of a household" }, { status: 409 });

    const now = new Date().toISOString();
    await rawDb.prepare(`UPDATE invites SET used = 1, updated_at = ? WHERE id = ?`).run(now, invite.id);
    await rawDb
      .prepare(
        `INSERT INTO memberships (id, household_id, user_id, role, points_total, joined_at)
         VALUES (?, ?, ?, ?, 0, ?)
         ON CONFLICT (household_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      )
      .run(`mem-${crypto.randomUUID()}`, invite.household_id, userId, invite.role || "child", now);

    const household = await rawDb.prepare(`SELECT id, name FROM households WHERE id = ?`).get(invite.household_id) as any;
    return NextResponse.json({ ok: true, household: { id: invite.household_id, name: household?.name || "Household" } });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Join household failed");
    return NextResponse.json({ error: "Failed to join household" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return joinHousehold(body?.code, request);
}
