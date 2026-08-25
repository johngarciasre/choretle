import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { error } from "@/lib/logger";

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

    const user = await db.select().from(schema.users).where(eq(schema.users.id, payload.userId)).first();
    if (!user) {
      return { error: "User not found" };
    }

    return { userId: payload.userId, familyId: payload.familyId || user.familyId || "" };
  } catch (error) {
    error({ err: error }, "Token verification failed");
    return { error: "Invalid token" };
  }
}

// ─── GET: Fetch teams for a family ──────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const familyId = url.searchParams.get("familyId");

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
  } catch (error) {
    error({ err: error }, "Teams GET failed");
    if (error instanceof Error && error.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to fetch teams", details: String(error) }, { status: 500 });
  }
}

// ─── POST: Create a new team ────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const body = await request.json();
    const { name, logoUrl } = body;

    if (!name) {
      return NextResponse.json({ error: "Team name is required" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) {
      throw new Error("Database not initialized");
    }

    // Verify user belongs to this family
    const userFamily = await db.select().from(schema.users).where(
      and(eq(schema.users.id, authResult.userId), eq(schema.users.familyId, authResult.familyId))
    ).first();

    if (!userFamily) {
      return NextResponse.json({ error: "You don't have access to this family" }, { status: 403 });
    }

    // Create team
    const team = await db.insert(schema.teams).values({
      familyId: authResult.familyId,
      name,
      logoUrl: logoUrl || null,
    }).returning("*");

    return NextResponse.json({
      ok: true,
      team: team[0],
    });
  } catch (error) {
    error({ err: error }, "Teams POST failed");
    if (error instanceof Error && error.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to create team", details: String(error) }, { status: 500 });
  }
}
