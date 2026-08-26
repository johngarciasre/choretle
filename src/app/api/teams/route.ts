import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
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
