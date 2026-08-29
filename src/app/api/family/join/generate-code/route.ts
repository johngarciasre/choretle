import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { createInvite } from "@/lib/db/service";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { error } from "@/lib/logger.server";
import { generateInviteCode, isValidInviteCode } from "@/lib/invite-codes";

/**
 * POST /api/family/join/generate-code
 * Generate a new invite code for the current user's family.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (!auth.familyId) {
      return NextResponse.json({ error: "User has no family" }, { status: 400 });
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

    const body = await request.json();
    const permanent = body?.permanent === true;

    // Generate a unique code — retry if collision
    let code = generateInviteCode();
    let maxRetries = 10;

    while (maxRetries-- > 0) {
      const existing = await db.select().from(schema.invites).where({ code }).limit(1);
      if (!existing[0]) break;
      code = generateInviteCode();
    }

    // Validate the generated code
    if (!isValidInviteCode(code)) {
      return NextResponse.json({ error: "Failed to generate valid invite code" }, { status: 500 });
    }

    // Calculate expiry (6 months from now, or null if permanent)
    const expiresAt = permanent ? null : new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString();

    const invite = await createInvite({
      id: `invite-${Date.now()}`,
      familyId: auth.familyId,
      code,
      role: "child",
      expiresAt,
      used: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    if (!invite) {
      return NextResponse.json({ error: "Failed to create invite code" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, invite: { ...invite, expiresAt: invite.expires_at || null } });
  } catch (err) {
    error({ err }, "Generate invite code failed");
    return NextResponse.json({ error: "Failed to generate invite code" }, { status: 500 });
  }
}
