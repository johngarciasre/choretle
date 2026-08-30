import { NextRequest, NextResponse } from "next/server";
import { getInviteByCode, createInvite, deleteInvite } from "@/lib/db/service";
import * as schema from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { error, info } from "@/lib/logger.server";
import { verifyAuth, extractUserId } from "@/lib/auth";

/**
 * GET /api/family/join?familyId=<id>
 * List all invite codes for a family (admin only).
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const familyId = url.searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json({ error: "Family ID is required" }, { status: 400 });
    }

    const auth = verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Verify user belongs to this family
    if (auth.familyId !== familyId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Dynamic import to avoid bundling better-sqlite3 in client
    const { initDb } = await import("@/db/drizzle");
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Get user role to check admin access
    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, auth.userId)).limit(1);
    const user = userRows[0];
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Fetch all invites for this family
    const invites = await db.select().from(schema.invites).where(eq(schema.invites.familyId, familyId)).orderBy(sql`created_at DESC`);

    return NextResponse.json({ ok: true, invites: invites || [] });
  } catch (err) {
    error({ err }, "List invites failed");
    return NextResponse.json({ error: "Failed to list invites" }, { status: 500 });
  }
}

/**
 * POST /api/family/join
 * Join a family using an invite code.
 */
export async function joinFamily(code: string, request: NextRequest) {
  try {
    if (!code) return NextResponse.json({ error: "Invite code is required" }, { status: 400 });

    // Get current user — uses middleware headers (prod) or dev-session cookie fallback (dev/Turbopack)
    const userId = extractUserId(request);

    if (!userId) {
      return NextResponse.json({ error: "You must be logged in to join a family" }, { status: 401 });
    }

    const invite = await getInviteByCode(code);
    
    if (!invite) {
      return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
    }

    // Check if invite has expired
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return NextResponse.json({ error: "Invite code has expired" }, { status: 400 });
    }

    // Mark invite as used
    const { initDb } = await import("@/db/drizzle");
    const db = await initDb();
    if (db) {
      // Guard: user must not already belong to a family (one family per member)
      const existingUser = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      if (existingUser[0]?.familyId) {
        return NextResponse.json({ error: "You are already a member of a family" }, { status: 409 });
      }

      await db.update(schema.invites).set({ 
        used: 1,
        updatedAt: new Date().toISOString(),
      }).where(eq(schema.invites.id, invite.id));

      // Update the user's familyId in the database
      await db.update(schema.users).set({ 
        familyId: invite.familyId,
        updatedAt: new Date().toISOString(),
      }).where(eq(schema.users.id, userId));
    }

    return NextResponse.json({ 
      id: invite.familyId, 
      name: "Family" 
    });
  } catch (err) {
    error({ err: err }, "Join family failed");
    return NextResponse.json({ error: "Failed to join family" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return joinFamily(body?.code, request);
}
