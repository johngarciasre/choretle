import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { createDevSession, setDevSessionCookie, parseDevSession, DEV_COOKIE_NAME, DEV_USERS } from "@/lib/dev-auth";
import { initDb, rawInsert } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { error, info } from "@/lib/logger.server";

/**
 * Check if Supabase credentials are properly configured.
 * Requires both URL and anon key to be set.
 */
function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Sign up a new user with email and password using Supabase Auth.
 * In dev mode (AUTH_MODE=dev), uses mock users instead.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // ─── Dev Mode: Create mock user ────────────────────────
    if (process.env.AUTH_MODE === "dev") {
      const email = body?.email?.toLowerCase().trim() || "";
      const name = body?.name || "Dev User";
      
      let userId = "parent";
      let role = "admin";
      
      if (email.includes("child")) {
        userId = "child";
        role = "child";
      } else {
        // Default to parent/admin role for admin@ and parent@ emails
        userId = "admin";
        role = "admin";
      }

      // Ensure DB user record exists in dev mode and read actual familyId
      let familyId: string | null = null;
      try {
        const db = await initDb();
        if (db) {
          const existingUser = (await db.select().from(schema.users).where(eq(schema.users.id, DEV_USERS[userId].id)).limit(1))[0];
          
          if (!existingUser) {
            await rawInsert("users", {
              id: DEV_USERS[userId].id,
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
          
          const userRecord = (await db.select().from(schema.users).where(eq(schema.users.id, DEV_USERS[userId].id)).limit(1))[0];
          familyId = userRecord?.family_id || null;
        }
      } catch (dbError) {
        // Silently fail — user is created in Supabase Auth anyway
      }

      const devUserId = DEV_USERS[userId].id;
      const session = createDevSession({ userId: devUserId });
      session.user.familyId = familyId;

      const response = NextResponse.json(
        { 
          ok: true, 
          userId: session.user.id,
          email: session.user.email,
          message: "Sign up successful (dev mode)",
          requiresEmailConfirmation: false,
        },
        { status: 200 }
      );

      setDevSessionCookie(response.headers, session);
      return response;
    }

    // ─── Production Mode: Use Supabase Auth ────────────────
    
    if (!hasSupabaseConfig()) {
      error({ url: !!process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }, "[SIGNUP] Missing Supabase credentials");
      return NextResponse.json(
        { error: "Server configuration error: Supabase credentials not found. Please check environment variables." },
        { status: 500 }
      );
    }

    // Validate input - log what we received
    info({ body }, "[SIGNUP] Received body");
    
    if (!body?.email || !body?.password || !body?.name) {
      return NextResponse.json(
        { error: "Email, password, and name are required" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseMiddlewareClient(request);
    if (!supabase) {
      error("Failed to initialize Supabase client");
      return NextResponse.json(
        { error: "Failed to initialize authentication service" },
        { status: 500 }
      );
    }

    // Sign up with Supabase Auth
    const signUpResult = await supabase.auth.signUp({
      email: body.email.toLowerCase().trim(),
      password: body.password,
      options: {
        data: {
          name: body.name,
          role: "parent",
        },
      },
    });

    if (signUpResult.error) {
      info({ message: signUpResult.error.message }, "[SIGNUP] Supabase error");
      
      if (signUpResult.error.message?.includes("Email already registered")) {
        return NextResponse.json(
          { error: "An account with this email already exists" },
          { status: 409 }
        );
      }
      
      if (signUpResult.error.message?.includes("Weak password")) {
        return NextResponse.json(
          { error: "Password is too weak. Please use at least 6 characters." },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: signUpResult.error.message || "Failed to sign up" },
        { status: 400 }
      );
    }

    if (!signUpResult.data?.user) {
      error("No user created in Supabase Auth");
      return NextResponse.json(
        { error: "User registration failed" },
        { status: 500 }
      );
    }

    const userId = signUpResult.data.user.id;
    const userEmail = signUpResult.data.user.email || null;

    // Create corresponding row in users table and ensure family membership exists
    let familyId: string | null = null;
    try {
      const db = await initDb();
      if (db) {
        // Check if user already has a family assignment
        const existingUserWithFamily = await db.select().from(schema.users).where(
          eq(schema.users.id, userId),
          sql`${schema.users.familyId} IS NOT NULL`
        ).limit(1)[0];

        if (!existingUserWithFamily) {
          // Create a default family for the new user
          const familyName = body.name ? `${body.name}'s Family` : "My Family";
          const familySlug = `family-${Date.now()}`;
          
          const newFamily = await rawInsert("families", {
            id: `family-${Date.now()}`,
            name: familyName,
            slug: familySlug,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          
          familyId = newFamily?.id || null;
        } else {
          familyId = existingUserWithFamily.familyId;
        }

        // Create or update user record in users table
        const existingUser = (await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1))[0];
        
        if (!existingUser) {
          await rawInsert("users", {
            id: userId,
            email: userEmail,
            name: body.name,
            role: "parent",
            family_id: familyId || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        } else if (existingUser.familyId !== familyId) {
          await db.update(schema.users).set({ 
            familyId,
            name: body.name,
            updatedAt: new Date().toISOString()
          }).where(eq(schema.users.id, existingUser.id));
        }
      }
    } catch (dbError) {
      error({ err: dbError }, "[SIGNUP] Database operations failed");
      // Silently fail - user is created in Supabase Auth anyway
    }

    return NextResponse.json(
      { 
        ok: true, 
        userId,
        email: userEmail,
        familyId: familyId || null,
        message: "Sign up successful. Welcome to Choretle!",
        requiresEmailConfirmation: false,
      },
      { status: 200 }
    );
  } catch (err) {
    error({ err: err }, "[SIGNUP] Unhandled error");
    
    if (error instanceof Error) {
      return NextResponse.json(
        { 
          error: "An unexpected error occurred",
          details: process.env.NODE_ENV === "development" ? error.message : undefined 
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Sign up failed" },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for sign-up page (returns the current session if logged in).
 */
export async function GET(request: NextRequest) {
  try {
    // ─── Dev Mode: Check dev session cookie ────────────────
    if (process.env.AUTH_MODE === "dev") {
      const cookieHeader = request.headers.get("cookie") || "";
      const setCookie = cookieHeader.split(";").find((c) => c.includes(DEV_COOKIE_NAME));

      if (!setCookie) {
        return NextResponse.json({ authenticated: false });
      }

      const value = setCookie.replace(`${DEV_COOKIE_NAME}=`, "").trim();
      const user = parseDevSession(value);

      if (user) {
        return NextResponse.json({
          authenticated: true,
          user: {
            id: user.id,
            email: user.email,
            role: user.role || "child",
            name: user.name || "",
          },
        });
      }

      return NextResponse.json({ authenticated: false });
    }

    // ─── Production Mode: Use Supabase Auth ────────────────
    
    if (!hasSupabaseConfig()) {
      return NextResponse.json(
        { error: "Server configuration error: Supabase credentials not found. Please check environment variables." },
        { status: 500 }
      );
    }

    const supabase = await getSupabaseMiddlewareClient(request);
    
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      return NextResponse.json({
        authenticated: true,
        user: {
          id: session.user.id,
          email: session.user.email,
          role: session.user.user_metadata?.role || "child",
          name: session.user.user_metadata?.name || "",
        },
      });
    }

    return NextResponse.json({ authenticated: false });
  } catch (err) {
    return NextResponse.json({ authenticated: false, error: "Failed to check session" }, { status: 500 });
  }
}
