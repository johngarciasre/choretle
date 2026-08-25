import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { error } from "@/lib/logger.server";

// ─── Middleware: Verify Auth Token ──────────────────────────────────
async function verifyAuth(request: NextRequest): Promise<{ userId: string; familyId: string } | { error: string }> {
  const cookie = request.cookies.get("auth-token")?.value;
  if (!cookie) {
    return { error: "No token provided" };
  }

  try {
    const parts = cookie.split(".");
    if (parts.length !== 3) {
      return { error: "Invalid token format" };
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const now = Math.floor(Date.now() / 1000);
    
    if (payload.exp && payload.exp < now) {
      return { error: "Token expired" };
    }

    const db = await initDb();
    if (!db) {
      return { error: "Database not initialized" };
    }

    const user = (await db.select().from(schema.users).where(eq(schema.users.id, payload.userId)).limit(1))[0];
    if (!user) {
      return { error: "User not found" };
    }

    return { userId: payload.userId, familyId: payload.familyId || user.familyId || "" };
  } catch (error) {
    error({ err: error }, "Token verification failed");
    return { error: "Invalid token" };
  }
}

// ─── POST: Add a member to a team ───────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const url = new URL(request.url);
    const familyId = url.searchParams.get("familyId");
    const teamId = url.pathname.split("/").pop(); // Get last segment as teamId

    if (!familyId || !teamId) {
      return NextResponse.json({ error: "Family ID and Team ID are required" }, { status: 400 });
    }

    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) {
      throw new Error("Database not initialized");
    }

    // Verify user belongs to this family
    const memberFamily = await db.select().from(schema.users).where(
      and(eq(schema.users.id, userId), eq(schema.users.familyId, authResult.familyId))
    ).limit(1)[0];

    if (!memberFamily) {
      return NextResponse.json({ error: "User not found in this family" }, { status: 404 });
    }

    // Verify the team belongs to this family and user has access
    const team = await db.select().from(schema.teams).where(
      and(eq(schema.teams.id, teamId), eq(schema.teams.familyId, authResult.familyId))
    ).limit(1)[0];

    if (!team) {
      return NextResponse.json({ error: "Team not found or access denied" }, { status: 403 });
    }

    // Check if user is already a member of this team
    const existingMember = await db.select().from(schema.teamMembers).where(
      and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, userId))
    ).limit(1)[0];

    if (existingMember) {
      return NextResponse.json({ error: "User is already a member of this team" }, { status: 409 });
    }

    // Add user to team
    const membership = await db.insert(schema.teamMembers).values({
      teamId,
      userId,
      joinedAt: new Date(),
    }).returning("*");

    return NextResponse.json({
      ok: true,
      membership: membership[0],
    });
  } catch (error) {
    error({ err: error }, "Team members POST failed");
    if (error instanceof Error && error.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to add member to team", details: String(error) }, { status: 500 });
  }
}
