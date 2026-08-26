import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createDevSession, setDevSessionCookie, DEV_COOKIE_NAME, DEV_USERS } from "@/lib/dev-auth";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { error } from "@/lib/logger.server";
import { slugify } from "@/lib/slugify";
import { rawInsert } from "@/db/drizzle";

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  if (!body?.email || !body?.password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  // ─── Dev Mode: Mock sign in ──────────────────────────────
  if (process.env.AUTH_MODE === "dev") {
    const email = body?.email?.toLowerCase().trim() || "";
    
    let userIdKey = "admin";
    let role = "admin";
    let name = "Admin (Parent)";
    
    if (email.includes("child")) {
      userIdKey = "child";
      role = "child";
      name = "Child";
    } else {
      // Default to admin for admin@ and parent@ emails
      userIdKey = "admin";
      role = "admin";
      name = "Admin (Parent)";
    }

    const devUserId = DEV_USERS[userIdKey].id;

    // Ensure DB user record exists in dev mode and read actual familyId
    let familyId: string | null = null;
    try {
      const { initDb } = await import("@/db/drizzle");
      const db = await initDb();
      if (db) {
        const existingUser = (await db.select().from(schema.users).where(eq(schema.users.id, devUserId)).limit(1))[0];
        
        if (!existingUser) {
          await rawInsert("users", {
            id: devUserId,
            email: email || null,
            name: name,
            role: role,
            avatar_url: null,
            family_id: null,
            points_total: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        
        const userRecord = (await db.select().from(schema.users).where(eq(schema.users.id, devUserId)).limit(1))[0];
        familyId = userRecord?.family_id || null;
      }
    } catch (dbError) {
      error({ err: dbError }, "[DEV SIGNIN] Database sync failed");
    }

    // Create session with actual familyId from DB
    const session = createDevSession({ userId: devUserId });
    session.user.familyId = familyId;

    const response = NextResponse.json({ 
      ok: true, 
      userId: session.user.id,
      email: session.user.email,
      role: role,
      message: "Sign in successful (dev mode)"
    });

    setDevSessionCookie(response.headers, session);
    return response;
  }

  // ─── Production Mode: Use Supabase Auth ────────────────
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
            const { name, value, options } = cookie;
            let cookieStr = `${name}=${value}`;
            if (options) {
              for (const [key, val] of Object.entries(options)) {
                cookieStr += `; ${key}=${val}`;
              }
            }
          }
        },
      }
    }
  );

  const signInResult = await supabase.auth.signInWithPassword({
    email: body.email.toLowerCase().trim(),
    password: body.password,
  });

  if (signInResult.error) {
    return NextResponse.json(
      { error: signInResult.error.message || "Failed to sign in" },
      { status: 401 }
    );
  }

  const session = signInResult.data.session;
  if (!session) {
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }

  // Ensure DB user record exists after sign in — use dynamic import to avoid bundling better-sqlite3
  try {
    const { initDb } = await import("@/db/drizzle");
    const db = await initDb();
    if (db) {
      const existingUser = (await db.select().from(schema.users).where(eq(schema.users.id, session.user.id)).limit(1))[0];
      
      if (!existingUser) {
        // Generate a default slug for auto-created family
        const slug = slugify(session.user.email || "family");
        
        // Check if a family with this slug already exists
        const existingFamilyRows = await db.select().from(schema.families)
          .where(eq(schema.families.slug, slug))
          .limit(1);

        let familyId: string | null = null;
        
        if (existingFamilyRows[0]) {
          familyId = existingFamilyRows[0].id;
        } else {
          // Auto-create a family for the new user
          const newFamily = await rawInsert("families", {
            id: `family-${Date.now()}`,
            name: session.user.email?.split("@")[0] || "My Family",
            slug,
            week_start_day: 0,
            teams_enabled: false,
          });
          
          if (newFamily) {
            familyId = newFamily.id;
          }
        }

        // Create DB user record with family association
        await rawInsert("users", {
          id: session.user.id,
          email: session.user.email || null,
          name: session.user.user_metadata?.name || body.name || "User",
          role: session.user.user_metadata?.role || "child",
          avatar_url: session.user.user_metadata?.avatar_url || null,
          family_id: familyId,
          points_total: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } else if (existingUser.email !== session.user.email) {
        // Update email if it changed
        await db.update(schema.users).set({ 
          email: session.user.email || null,
          name: session.user.user_metadata?.name || existingUser.name,
          role: session.user.user_metadata?.role || existingUser.role,
          avatarUrl: session.user.user_metadata?.avatar_url || existingUser.avatarUrl,
          updatedAt: new Date().toISOString(),
        }).where(eq(schema.users.id, session.user.id));
      }
    }
  } catch (dbError) {
    error({ err: dbError }, "[SIGNIN] Database sync failed");
  }

  const response = new Response(
    JSON.stringify({ 
      ok: true, 
      userId: session.user.id,
      email: session.user.email,
      role: session.user.user_metadata?.role || "child",
      message: "Sign in successful"
    }),
    { status: 200 }
  );

  const cookieName = `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL!.split("//")[1].split(".")[0]}${process.env.NODE_ENV === 'production' ? '-auth' : ''}-token`;
  response.headers.append(
    "set-cookie",
    `${cookieName}=${encodeURIComponent(JSON.stringify({
      access_token: session.access_token,
      token_type: "bearer",
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      refresh_token: session.refresh_token,
      user: {
        id: session.user.id,
        aud: session.user.aud,
        email: session.user.email,
        phone: session.user.phone,
        app_metadata: session.user.app_metadata,
        user_metadata: session.user.user_metadata,
        identities: session.user.identities,
      }
    }))}; Path=/; Secure; HttpOnly; SameSite=Lax`
  );

  return response;
}
