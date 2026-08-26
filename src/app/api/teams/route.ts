import { NextRequest, NextResponse } from "next/server";
import { initDb, rawInsert, rawDeleteWhere } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { error } from "@/lib/logger.server";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const familyId = url.searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json({ ok: false, error: "Family ID is required" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Fetch teams for this family with members
    const teams = await db.select().from(schema.teams).where(eq(schema.teams.familyId, familyId));

    const teamsWithMembers: any[] = [];
    if (teams && (teams as any[]).length > 0) {
      for (const team of teams as any[]) {
        const members = await db.select().from(schema.teamMembers).where(
          eq(schema.teamMembers.teamId, team.id)
        );
        
        teamsWithMembers.push({
          ...team,
          members: (members as any[]),
        });
      }
    }

    return NextResponse.json({ ok: true, teams: teamsWithMembers });
  } catch (err) {
    error({ err }, "Teams GET failed");
    return NextResponse.json({ error: "Failed to fetch teams" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const body = await request.json();
    const { name, familyId } = body;

    if (!name || !familyId) {
      return NextResponse.json({ error: "name and familyId are required" }, { status: 400 });
    }

    const result = await rawInsert("teams", {
      id: `team-${Date.now()}`,
      family_id: familyId,
      name: name,
      logo_url: null,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    error({ err }, "Teams POST failed");
    return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const body = await request.json();
    const { id, name, teamId } = body;
    const targetId = id || teamId;

    if (!targetId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;

    await db.update(schema.teams).set(updates).where(eq(schema.teams.id, targetId));

    const updated = await db.select().from(schema.teams).where(eq(schema.teams.id, targetId)).limit(1);
    return NextResponse.json(updated[0]);
  } catch (err) {
    error({ err }, "Teams PUT failed");
    return NextResponse.json({ error: "Failed to update team" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Delete team members first (foreign key)
    await db.delete(schema.teamMembers).where(eq(schema.teamMembers.teamId, id));
    await rawDeleteWhere("teams", [{ col: "id", val: id }]);

    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err }, "Teams DELETE failed");
    return NextResponse.json({ error: "Failed to delete team" }, { status: 500 });
  }
}
