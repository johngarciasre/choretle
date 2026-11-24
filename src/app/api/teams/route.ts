import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const teams = rawDb.prepare(`SELECT * FROM teams WHERE family_id = ?`).all(auth.familyId) as any[];
    const teamsWithMembers: any[] = [];
    for (const team of teams || []) {
      const members = rawDb.prepare(
        `SELECT tm.*, u.name as user_name, u.avatar_url FROM team_members tm LEFT JOIN users u ON tm.user_id = u.id WHERE tm.team_id = ?`
      ).all(team.id) as any[];
      teamsWithMembers.push({ ...team, members: members || [] });
    }
    return NextResponse.json({ ok: true, teams: teamsWithMembers });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Teams GET failed");
    return NextResponse.json({ error: "Failed to fetch teams" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    if (auth.role !== "parent") {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const body = await request.json();
    const { name } = body;
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const now = new Date().toISOString();
    const teamId = `team-${crypto.randomUUID()}`;
    rawDb.prepare(
      `INSERT INTO teams (id, family_id, name, logo_url, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(teamId, auth.familyId, name, null, now);

    const result = rawDb.prepare(`SELECT * FROM teams WHERE id = ?`).get(teamId) as any;
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Teams POST failed");
    return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    if (auth.role !== "parent") {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, teamId } = body;
    const targetId = id || teamId;
    if (!targetId) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    // teams has no updated_at column.
    const owned = rawDb.prepare(`SELECT id FROM teams WHERE id = ? AND family_id = ?`).get(targetId, auth.familyId);
    if (!owned) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    if (name !== undefined) {
      rawDb.prepare(`UPDATE teams SET name = ? WHERE id = ? AND family_id = ?`).run(name, targetId, auth.familyId);
    }

    const updated = rawDb.prepare(`SELECT * FROM teams WHERE id = ?`).get(targetId) as any;
    return NextResponse.json(updated);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Teams PUT failed");
    return NextResponse.json({ error: "Failed to update team" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    if (auth.role !== "parent") {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const body = await request.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const owned = rawDb.prepare(`SELECT id FROM teams WHERE id = ? AND family_id = ?`).get(id, auth.familyId);
    if (!owned) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    rawDb.prepare(`DELETE FROM team_members WHERE team_id = ?`).run(id);
    rawDb.prepare(`DELETE FROM teams WHERE id = ? AND family_id = ?`).run(id, auth.familyId);
    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Teams DELETE failed");
    return NextResponse.json({ error: "Failed to delete team" }, { status: 500 });
  }
}
