import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ familyId: string; teamId: string }> }) {
  try {
    const auth = verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const { familyId, teamId } = await params;

    const members = rawDb.prepare(
      `SELECT tm.*, u.name as user_name, u.avatar_url FROM team_members tm LEFT JOIN users u ON tm.user_id = u.id WHERE tm.team_id = ?`
    ).all(teamId) as any[];
    return NextResponse.json((members || []).map((m: any) => ({
      id: m.id, userId: m.user_id, userName: m.user_name, avatarUrl: m.avatar_url,
    })));
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Team members GET failed");
    return NextResponse.json({ error: "Failed to fetch team members" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ familyId: string; teamId: string }> }) {
  try {
    const auth = verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const body = await request.json();
    const { userId } = body;
    const { familyId, teamId } = await params;

    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    // Verify user belongs to family
    const memberFamilyRows = rawDb.prepare(`SELECT id FROM users WHERE id = ? AND family_id = ?`).get(userId, familyId) as any;
    if (!memberFamilyRows) return NextResponse.json({ error: "User not in this family" }, { status: 403 });

    // Verify team belongs to family
    const teamRows = rawDb.prepare(`SELECT id FROM teams WHERE id = ? AND family_id = ?`).get(teamId, familyId) as any;
    if (!teamRows) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    // Check for existing member
    const existingMemberRows = rawDb.prepare(`SELECT id FROM team_members WHERE team_id = ? AND user_id = ?`).get(teamId, userId) as any;
    if (existingMemberRows) return NextResponse.json({ error: "User already in team" }, { status: 409 });

    const now = new Date().toISOString();
    const memberId = `tm-${Date.now()}`;
    rawDb.prepare(`INSERT INTO team_members (id, team_id, user_id, joined_at) VALUES (?, ?, ?, ?)`).run(memberId, teamId, userId, now);

    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Team members POST failed");
    return NextResponse.json({ error: "Failed to add team member" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ familyId: string; teamId: string }> }) {
  try {
    const auth = verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const body = await request.json();
    const { userId } = body;
    const { familyId, teamId } = await params;

    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    // Verify team belongs to family
    const teamRows = rawDb.prepare(`SELECT id FROM teams WHERE id = ? AND family_id = ?`).get(teamId, familyId) as any;
    if (!teamRows) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    // Remove member
    const existingMemberRows = rawDb.prepare(`SELECT id FROM team_members WHERE team_id = ? AND user_id = ?`).get(teamId, userId) as any;
    if (!existingMemberRows) return NextResponse.json({ error: "User not in team" }, { status: 404 });

    rawDb.prepare(`DELETE FROM team_members WHERE id = ?`).run(existingMemberRows.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Team members DELETE failed");
    return NextResponse.json({ error: "Failed to remove team member" }, { status: 500 });
  }
}
