import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { createDevSession, setDevSessionCookie, parseDevSession, DEV_COOKIE_NAME } from "@/lib/dev-auth";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { error, info } from "@/lib/logger";

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
      
      let userId = "dev-user-parent-001";
      let role = "admin";
      
      if (email.includes("child")) {
        userId = "dev-user-child-001";
        role = "child";
      } else if (!email.includes("parent")) {
        // Default to parent/admin role
        userId = "dev-user-parent-001";
        role = "admin";
      }

      const session = createDevSession({ userId });

      const response = NextResponse.json(
        { 
          ok: true, 
          userId: session.user.id,
          email: session.user.email,
          message: "Sign up successful (dev mode)",
          requiresEmailConfirmation: false,
        },
        {
          status: 200,
          headers: {
            "x-user-id": session.user.id,
            "x-email": session.user.email || "",
          }
        }
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
        ).first();

        if (!existingUserWithFamily) {
          // Create a default family for the new user
          const familyName = body.name ? `${body.name}'s Family` : "My Family";
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

        // Create or update user record in users table
        const existingUser = await db.select().from(schema.users).where(eq(schema.users.id, userId)).first();
        
        if (!existingUser) {
          await db.insert(schema.users).values({
            id: userId,
            email: userEmail,
            name: body.name,
            role: "parent",
            familyId: familyId || null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        } else if (existingUser.familyId !== familyId) {
          await db.update(schema.users).set({ 
            familyId,
            name: body.name,
            updatedAt: new Date()
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
      {
        status: 200,
        headers: {
          "x-user-id": userId,
          "x-email": userEmail || "",
          "x-family-id": familyId || "",
        }
      }
    );
  } catch (error) {
    error({ err: error }, "[SIGNUP] Unhandled error");
    
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
  } catch (error) {
    return NextResponse.json({ authenticated: false, error: "Failed to check session" }, { status: 500 });
  }
}
