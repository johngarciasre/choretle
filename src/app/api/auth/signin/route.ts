import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createDevSession, setDevSessionCookie, parseDevSession, DEV_COOKIE_NAME } from "@/lib/dev-auth";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, sql } from "drizzle-orm";

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function POST(request: NextRequest) {
  console.log("[SIGNIN] === START ===");
  
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  if (process.env.AUTH_MODE === "dev") {
    const email = body?.email?.toLowerCase().trim() || "";
    
    let userId = "dev-user-admin-001";
    let role = "admin";
    
    if (email.includes("child")) {
      userId = "dev-user-child-001";
      role = "child";
    } else if (email.includes("parent")) {
      userId = "dev-user-parent-001";
      role = "admin";
    }
    
    const session = createDevSession({ userId });

    console.log("[SIGNIN] Dev mode - created session for user:", userId);

    const response = NextResponse.json(
      { 
        ok: true, 
        userId: session.user.id,
        email: session.user.email,
        role: session.user.role,
        message: "Sign in successful (dev mode)"
      },
      {
        status: 200,
        headers: {
          "x-user-id": session.user.id,
          "x-email": session.user.email || "",
          "x-role": session.user.role,
        }
      }
    );

    setDevSessionCookie(response.headers, session);
    
    console.log("[SIGNIN] === END ===");
    return response;
  }

  if (!hasSupabaseConfig()) {
    console.error("[SIGNIN] No Supabase credentials configured!");
    return NextResponse.json(
      { error: "Server configuration error: Supabase credentials not found." },
      { status: 500 }
    );
  }

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
            request.cookies.set(cookie.name, cookie.value);
          }
        },
      }
    }
  );

  console.log("[SIGNIN] Calling signInWithPassword...");
  const signInResult = await supabase.auth.signInWithPassword({
    email: body.email.toLowerCase().trim(),
    password: body.password,
  });

  console.log("[SIGNIN] signInResult:", JSON.stringify(signInResult));

  if (signInResult.error) {
    console.error("[SIGNIN] Sign in error:", signInResult.error.message);
    if (signInResult.error.message?.includes("Invalid login credentials")) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }
    
    if (signInResult.error.message?.includes("Email not confirmed")) {
      return NextResponse.json(
        { error: "Please verify your email address before signing in" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: signInResult.error.message || "Failed to sign in" },
      { status: 401 }
    );
  }

  if (!signInResult.data?.session) {
    console.error("[SIGNIN] No session in signInResult.data");
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }

  const userId = signInResult.data.session.user.id;
  const userEmail = signInResult.data.session.user.email || null;
  const userRole = signInResult.data.session.user.user_metadata?.role || "child";

  console.log("[SIGNIN] Auth successful! User:", userId);

  try {
    const db = await initDb();
    if (db && db.select) {
      const existingUserWithFamily = await db.select().from(schema.users).where(
        eq(schema.users.id, userId),
        sql`${schema.users.familyId} IS NOT NULL`
      ).first();

      let familyId: string | null = null;
      
      if (!existingUserWithFamily) {
        const familyName = userEmail ? `${userEmail.split('@')[0]}'s Family` : "My Family";
        const familySlug = `family-${Date.now()}`;
        
        const [newFamily] = await db.insert(schema.families).values({
          name: familyName,
          slug: familySlug,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning("*");
        
        familyId = newFamily.id;
      } else {
        familyId = existingUserWithFamily.familyId;
      }

      const existingUser = await db.select().from(schema.users).where(eq(schema.users.id, userId)).first();
      
      if (!existingUser) {
        await db.insert(schema.users).values({
          id: userId,
          email: userEmail,
          name: "",
          role: userRole,
          familyId: familyId || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else if (existingUser.familyId !== familyId) {
        await db.update(schema.users).set({ 
          familyId,
          updatedAt: new Date()
        }).where(eq(schema.users.id, existingUser.id));
      }
    }
  } catch (dbError) {
    console.warn("[SIGNIN] DB operation failed (non-fatal):", dbError);
  }

  const response = NextResponse.json(
    { 
      ok: true, 
      userId,
      email: userEmail,
      role: userRole,
      familyId: null, 
      message: "Sign in successful"
    },
    {
      status: 200,
      headers: {
        "x-user-id": userId,
        "x-email": userEmail || "",
        "x-role": userRole,
      }
    }
  );

  console.log("[SIGNIN] About to set cookies...");
  
  const tokens = signInResult.data.session;
  if (tokens) {
    console.log("[SIGNIN] Tokens available:", !!tokens.access_token);
    
    // Access token cookie - MUST use append() since set-cookie can have multiple values
    response.headers.append(
      "set-cookie",
      `supabase-token=${encodeURIComponent(JSON.stringify({
        access_token: tokens.access_token,
        token_type: "bearer",
        expires_in: tokens.expires_in,
        expires_at: tokens.expires_at,
        refresh_token: tokens.refresh_token,
        user: {
          id: tokens.user.id,
          aud: tokens.user.aud,
          email: tokens.user.email,
          phone: tokens.user.phone,
          app_metadata: tokens.user.app_metadata,
          user_metadata: tokens.user.user_metadata,
          identities: tokens.user.identities,
        }
      }))}; Path=/; Secure; HttpOnly; SameSite=Lax`
    );
    
    // Refresh token cookie  
    response.headers.append(
      "set-cookie",
      `supabase-refresh-token=${encodeURIComponent(JSON.stringify({
        access_token: tokens.refresh_token,
        token_type: "bearer",
        expires_in: tokens.expires_in,
        expires_at: tokens.expires_at
      }))}; Max-Age=${tokens.expires_in}; Path=/; Secure; HttpOnly; SameSite=Lax`
    );
  } else {
    console.error("[SIGNIN] No tokens in session!");
  }

  console.log("[SIGNIN] === END ===");
  
  return response;
}
