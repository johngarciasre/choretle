import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { deleteInvite } from "@/lib/db/service";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { error } from "@/lib/logger.server";

/**
 * DELETE /api/family/join/[code]/route.ts
 * Invalidate (delete) a specific invite code.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const auth = verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
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

    // Find the invite by code
    const invites = await db.select().from(schema.invites).where(eq(schema.invites.code, code)).limit(1);
    if (!invites[0]) {
      return NextResponse.json({ error: "Invite code not found" }, { status: 404 });
    }

    // Verify the invite belongs to this user's family
    if (invites[0].familyId !== auth.familyId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    await deleteInvite(invites[0].id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    error({ err }, "Invalidate invite code failed");
    return NextResponse.json({ error: "Failed to invalidate invite code" }, { status: 500 });
  }
}
