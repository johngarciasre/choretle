import { NextRequest, NextResponse } from "next/server";
import { initDb, rawInsert } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

/**
 * Extracts familyId and teamId from the URL path for nested dynamic routes.
 */
function getRouteIdsFromPath(request: NextRequest): { familyId: string | undefined; teamId: string | undefined } {
  const url = new URL(request.url);
  const segments = url.pathname.split("/");
  let familyId: string | undefined;
  let teamId: string | undefined;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === "family" && i + 1 < segments.length) {
      familyId = segments[i + 1];
    } else if (segments[i] === "teams" && i + 1 < segments.length) {
      teamId = segments[i + 1];
    }
  }
  return { familyId, teamId };
}

// ─── POST: Add a member to a team ───────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Extract familyId and teamId from URL path
    const { familyId, teamId } = getRouteIdsFromPath(request);

    if (!familyId || !teamId) {
      return NextResponse.json({ error: "Family ID and Team ID are required" }, { status: 400 });
    }

    const body = await request.json();
    const { userId: newUserId } = body;

    if (!newUserId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) {
      throw new Error("Database not initialized");
    }

    // Verify user belongs to this family
    const memberFamilyRows = await db.select().from(schema.users).where(
      and(eq(schema.users.id, newUserId), eq(schema.users.familyId, familyId))
    ).limit(1);
    const memberFamily = memberFamilyRows[0];

    if (!memberFamily) {
      return NextResponse.json({ error: "User not found in this family" }, { status: 404 });
    }

    // Verify the team belongs to this family and user has access
    const teamRows = await db.select().from(schema.teams).where(
      and(eq(schema.teams.id, teamId), eq(schema.teams.familyId, familyId))
    ).limit(1);
    const team = teamRows[0];

    if (!team) {
      return NextResponse.json({ error: "Team not found or access denied" }, { status: 403 });
    }

    // Check if user is already a member of this team
    const existingMemberRows = await db.select().from(schema.teamMembers).where(
      and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, newUserId))
    ).limit(1);

    if (existingMemberRows[0]) {
      return NextResponse.json({ error: "User is already a member of this team" }, { status: 409 });
    }

    // Add user to team
    const membership = await rawInsert("team_members", {
      id: `tm-${Date.now()}`,
      team_id: teamId,
      user_id: newUserId,
      joined_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      membership: membership[0],
    });
  } catch (err) {
    error({ err }, "Team members POST failed");
    if (err instanceof Error && err.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to add member to team", details: String(err) }, { status: 500 });
  }
}

// ─── DELETE: Remove a member from a team ──────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Extract familyId and teamId from URL path
    const { familyId, teamId } = getRouteIdsFromPath(request);

    if (!familyId || !teamId) {
      return NextResponse.json({ error: "Family ID and Team ID are required" }, { status: 400 });
    }

    const body = await request.json();
    const { userId: memberUserId } = body;

    if (!memberUserId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) {
      throw new Error("Database not initialized");
    }

    // Verify the team belongs to this family
    const teamRows = await db.select().from(schema.teams).where(
      and(eq(schema.teams.id, teamId), eq(schema.teams.familyId, familyId))
    ).limit(1);
    const team = teamRows[0];

    if (!team) {
      return NextResponse.json({ error: "Team not found or access denied" }, { status: 403 });
    }

    // Verify the membership exists for this user in this team
    const existingMemberRows = await db.select().from(schema.teamMembers).where(
      and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, memberUserId))
    ).limit(1);

    if (!existingMemberRows[0]) {
      return NextResponse.json({ error: "User is not a member of this team" }, { status: 404 });
    }

    // Delete the membership
    const result = await db.delete(schema.teamMembers).where(
      and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, memberUserId))
    );

    if (result === 0) {
      return NextResponse.json({ error: "User is not a member of this team" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      removedUserId: memberUserId,
    });
  } catch (err) {
    error({ err }, "Team members DELETE failed");
    if (err instanceof Error && err.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to remove member from team", details: String(err) }, { status: 500 });
  }
}
