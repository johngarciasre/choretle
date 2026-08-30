import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ familyId: string }> }) {
  try {
    const auth = verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const familyId = (await params).familyId;

    const teams = rawDb.prepare(`SELECT * FROM teams WHERE family_id = ?`).all(familyId) as any[];
    const teamsWithMembers: any[] = [];
    if (teams && teams.length > 0) {
      for (const team of teams) {
        const members = rawDb.prepare(
          `SELECT tm.*, u.name as user_name, u.avatar_url FROM team_members tm LEFT JOIN users u ON tm.user_id = u.id WHERE tm.team_id = ?`
        ).all(team.id) as any[];
        teamsWithMembers.push({ ...team, members: (members || []).map((m: any) => ({
          id: m.id, userId: m.user_id, userName: m.user_name, avatarUrl: m.avatar_url,
        })) });
      }
    }
    return NextResponse.json(teamsWithMembers);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Family teams GET failed");
    return NextResponse.json({ error: "Failed to fetch teams" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ familyId: string }> }) {
  try {
    const auth = verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const body = await request.json();
    const { name } = body;
    const familyId = (await params).familyId;

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const now = new Date().toISOString();
    const teamId = `team-${Date.now()}`;
    rawDb.prepare(`INSERT INTO teams (id, family_id, name, logo_url, created_at) VALUES (?, ?, ?, NULL, ?)`).run(teamId, familyId, name, now);

    const result = rawDb.prepare(`SELECT * FROM teams WHERE id = ?`).get(teamId) as any;
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Family teams POST failed");
    return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
  }
}
