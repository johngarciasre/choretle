import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { verifyAuth, canAuthor } from "@/lib/auth";

async function GET(request: NextRequest, { params }: { params: Promise<{ householdId: string; teamId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const { householdId, teamId } = await params;
    if (householdId !== auth.householdId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // The team id comes from the URL, so it must be proven to belong to this household.
    if (!await rawDb.prepare(`SELECT id FROM teams WHERE id = ? AND household_id = ?`).get(teamId, householdId)) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const members = await rawDb.prepare(
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

async function POST(request: NextRequest, { params }: { params: Promise<{ householdId: string; teamId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const body = await request.json();
    const { userId } = body;
    const { householdId, teamId } = await params;
    if (householdId !== auth.householdId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    // Verify user belongs to household
    const memberHouseholdRows = await rawDb.prepare(`SELECT user_id FROM memberships WHERE user_id = ? AND household_id = ?`).get(userId, householdId) as any;
    if (!memberHouseholdRows) return NextResponse.json({ error: "User not in this household" }, { status: 403 });

    // Verify team belongs to household
    const teamRows = await rawDb.prepare(`SELECT id FROM teams WHERE id = ? AND household_id = ?`).get(teamId, householdId) as any;
    if (!teamRows) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    // Check for existing member
    const existingMemberRows = await rawDb.prepare(`SELECT id FROM team_members WHERE team_id = ? AND user_id = ?`).get(teamId, userId) as any;
    if (existingMemberRows) return NextResponse.json({ error: "User already in team" }, { status: 409 });

    const now = new Date().toISOString();
    const memberId = `tm-${crypto.randomUUID()}`;
    await rawDb.prepare(`INSERT INTO team_members (id, team_id, user_id, joined_at) VALUES (?, ?, ?, ?)`).run(memberId, teamId, userId, now);

    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Team members POST failed");
    return NextResponse.json({ error: "Failed to add team member" }, { status: 500 });
  }
}

async function DELETE(request: NextRequest, { params }: { params: Promise<{ householdId: string; teamId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const body = await request.json();
    const { userId } = body;
    const { householdId, teamId } = await params;
    if (householdId !== auth.householdId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    // Verify team belongs to household
    const teamRows = await rawDb.prepare(`SELECT id FROM teams WHERE id = ? AND household_id = ?`).get(teamId, householdId) as any;
    if (!teamRows) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    // Remove member
    const existingMemberRows = await rawDb.prepare(`SELECT id FROM team_members WHERE team_id = ? AND user_id = ?`).get(teamId, userId) as any;
    if (!existingMemberRows) return NextResponse.json({ error: "User not in team" }, { status: 404 });

    await rawDb.prepare(`DELETE FROM team_members WHERE id = ?`).run(existingMemberRows.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Team members DELETE failed");
    return NextResponse.json({ error: "Failed to remove team member" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
const POST_impl = withTenant(POST);
export { POST_impl as POST };
const DELETE_impl = withTenant(DELETE);
export { DELETE_impl as DELETE };
