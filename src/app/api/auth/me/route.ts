import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { info, error } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") || "";
  
  info({ hasCookie: !!cookieHeader }, "[AUTH_ME] Cookie header");

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet) {
            request.cookies.set(cookie.name, cookie.value);
          }
        },
      }
    }
  );
  
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    // Query the users table to get familyId and other DB fields
    let familyId: string | null = null;
    let role: string = "child";
    
    try {
      const { initDb } = await import("@/db/drizzle");
      const db = await initDb();
      if (db) {
        const dbUser = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id)).first();
        if (dbUser) {
          familyId = dbUser.familyId || null;
          role = dbUser.role || "child";
        }
      }
    } catch (err) {
      error({ err: err }, "[AUTH_ME] Failed to query DB for user");
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        role: role,
        name: session.user.user_metadata?.name || "",
      },
      familyId: familyId,
    });
  }

  return NextResponse.json({ authenticated: false });
}
