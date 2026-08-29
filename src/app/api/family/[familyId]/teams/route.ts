import { NextRequest, NextResponse } from "next/server";
import { initDb, rawInsert } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

/**
 * Extracts the familyId from the URL path for [familyId] dynamic routes.
 */
function getFamilyIdFromPath(request: NextRequest): string | undefined {
  const url = new URL(request.url);
  const segments = url.pathname.split("/");
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i] === "family" && i + 1 < segments.length) {
      return segments[i + 1];
    }
  }
  return undefined;
}

// ─── GET: Fetch teams for a family ──────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    // Extract familyId from the URL path
    const familyId = getFamilyIdFromPath(request);

    if (!familyId) {
      return NextResponse.json({ error: "Family ID is required" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) {
      throw new Error("Database not initialized");
    }

    // Fetch teams for this family
    const teams = await db.select().from(schema.teams).where(eq(schema.teams.familyId, familyId));

    // Optionally fetch team members
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
    if (err instanceof Error && err.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to fetch teams", details: String(err) }, { status: 500 });
  }
}

// ─── POST: Create a new team ────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { name, logoUrl } = body;

    if (!name) {
      return NextResponse.json({ error: "Team name is required" }, { status: 400 });
    }

    // Extract familyId from the URL path
    const familyId = getFamilyIdFromPath(request);

    if (!familyId) {
      return NextResponse.json({ error: "Family ID is required" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) {
      throw new Error("Database not initialized");
    }

    // Verify user belongs to this family
    const userFamilyRows = await db.select().from(schema.users).where(
      and(eq(schema.users.id, auth.userId), eq(schema.users.familyId, familyId))
    ).limit(1);
    const userFamily = userFamilyRows[0];

    if (!userFamily) {
      return NextResponse.json({ error: "You don't have access to this family" }, { status: 403 });
    }

    // Create team
    const team = await rawInsert("teams", {
      id: `team-${Date.now()}`,
      family_id: familyId,
      name,
      logo_url: logoUrl || null,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      team: team[0],
    });
  } catch (err) {
    error({ err }, "Teams POST failed");
    if (err instanceof Error && err.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to create team", details: String(err) }, { status: 500 });
  }
}
