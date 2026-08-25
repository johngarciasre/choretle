import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { getInviteByCode } from "@/lib/db/service";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { error } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.code) return NextResponse.json({ error: "Invite code is required" }, { status: 400 });

    // Get current user — production mode uses Supabase session, dev mode uses x-user-id header
    let userId: string | null = null;
    
    const cookieHeader = request.headers.get("cookie") || "";
    if (cookieHeader && !process.env.AUTH_MODE) {
      try {
        const supabase = await getSupabaseMiddlewareClient(request);
        const { data: { session } } = await supabase.auth.getSession();
        userId = session?.user?.id || null;
      } catch (e) {
        error({ err: e }, "[JOIN] Supabase session check failed");
      }
    }

    // Fallback to middleware header for dev mode
    if (!userId) {
      userId = request.headers.get("x-user-id");
    }

    if (!userId) {
      return NextResponse.json({ error: "You must be logged in to join a family" }, { status: 401 });
    }

    const invite = await getInviteByCode(body.code);
    
    if (!invite) {
      return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
    }

    // Update the user's familyId in the database — use dynamic import to avoid bundling better-sqlite3
    const { initDb } = await import("@/db/drizzle");
    const db = await initDb();
    if (db) {
      await db.update(schema.users).set({ 
        familyId: invite.familyId,
        updatedAt: new Date(),
      }).where(eq(schema.users.id, userId));
    }

    return NextResponse.json({ 
      id: invite.familyId, 
      name: "Family" 
    });
  } catch (error) {
    error({ err: error }, "Join family failed");
    return NextResponse.json({ error: "Failed to join family" }, { status: 500 });
  }
}
