import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const familyId = url.searchParams.get("familyId");
    if (!familyId) return NextResponse.json({ ok: false, error: "Family ID is required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const teams = rawDb.prepare(`SELECT * FROM teams WHERE family_id = ?`).all(familyId) as any[];
    const teamsWithMembers: any[] = [];
    if (teams && teams.length > 0) {
      for (const team of teams) {
        const members = rawDb.prepare(`SELECT tm.*, u.name as user_name, u.avatar_url FROM team_members tm LEFT JOIN users u ON tm.user_id = u.id WHERE tm.team_id = ?`).all(team.id) as any[];
        teamsWithMembers.push({ ...team, members: members || [] });
      }
    }
    return NextResponse.json({ ok: true, teams: teamsWithMembers });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Teams GET failed");
    return NextResponse.json({ error: "Failed to fetch teams" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, familyId } = body;
    if (!name || !familyId) return NextResponse.json({ error: "name and familyId are required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const now = new Date().toISOString();
    const teamId = `team-${Date.now()}`;
    rawDb.prepare(
      `INSERT INTO teams (id, family_id, name, logo_url, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(teamId, familyId, name, null, now);

    const result = rawDb.prepare(`SELECT * FROM teams WHERE id = ?`).get(teamId) as any;
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Teams POST failed");
    return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, teamId } = body;
    const targetId = id || teamId;
    if (!targetId) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const updates: string[] = [];
    const values: any[] = [];
    if (name !== undefined) { updates.push("name = ?"); values.push(name); }
    updates.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(targetId);
    rawDb.prepare(`UPDATE teams SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    const updated = rawDb.prepare(`SELECT * FROM teams WHERE id = ?`).get(targetId) as any;
    return NextResponse.json(updated);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Teams PUT failed");
    return NextResponse.json({ error: "Failed to update team" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    rawDb.prepare(`DELETE FROM team_members WHERE team_id = ?`).run(id);
    rawDb.prepare(`DELETE FROM teams WHERE id = ?`).run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Teams DELETE failed");
    return NextResponse.json({ error: "Failed to delete team" }, { status: 500 });
  }
}
