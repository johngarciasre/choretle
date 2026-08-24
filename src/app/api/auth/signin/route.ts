import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  if (!body?.email || !body?.password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

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
      const existingUser = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id)).first();
      
      if (!existingUser) {
        // Create DB user record on first sign in
        await db.insert(schema.users).values({
          id: session.user.id,
          email: session.user.email || null,
          name: session.user.user_metadata?.name || body.name || "User",
          role: session.user.user_metadata?.role || "child",
          avatarUrl: session.user.user_metadata?.avatar_url || null,
          familyId: null,
          pointsTotal: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else if (existingUser.email !== session.user.email) {
        // Update email if it changed
        await db.update(schema.users).set({ 
          email: session.user.email || null,
          name: session.user.user_metadata?.name || existingUser.name,
          role: session.user.user_metadata?.role || existingUser.role,
          avatarUrl: session.user.user_metadata?.avatar_url || existingUser.avatarUrl,
          updatedAt: new Date(),
        }).where(eq(schema.users.id, session.user.id));
      }
    }
  } catch (dbError) {
    console.error("[SIGNIN] Database sync failed:", dbError);
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
