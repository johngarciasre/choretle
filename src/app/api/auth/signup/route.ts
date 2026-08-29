import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { createDevSession, setDevSessionCookie, DEV_COOKIE_NAME, parseDevSession } from "@/lib/dev-auth";
import { initDb, rawInsert } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, sql, count } from "drizzle-orm";
import { error, info } from "@/lib/logger.server";

/**
 * Check if Supabase credentials are properly configured.
 * Requires both URL and anon key to be set.
 */
function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Determine the role for a new user: first user gets 'admin', others get 'child'.
 */
async function getNewUserRole(db: any, familyId: string | null): Promise<string> {
  const whereClause = familyId ? eq(schema.users.familyId, familyId) : sql`1=1`;
  const result = await db.select().from(schema.users).where(whereClause).limit(0);
  // Use count query to check if any users exist
  const countResult = await db.select({ count: count() }).from(schema.users).where(whereClause).limit(1);
  return (countResult[0]?.count ?? 0) === 0 ? "admin" : "child";
}

/**
 * Sign up a new user with email and password using Supabase Auth.
 * In dev mode (AUTH_MODE=dev), uses mock users instead.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // ─── Dev Mode: Create mock user ─────────────────────────────
    if (process.env.AUTH_MODE === "dev") {
      const email = body?.email?.toLowerCase().trim() || "";
      const name = body?.name || "Dev User";

      // Check if any users exist in DB to determine role
      let role = "child";
      let familyId: string | null = null;
      try {
        const db = await initDb();
        if (db) {
          // Count existing users across all families
          const countResult = await db.select({ count: count() }).from(schema.users).limit(1);
          role = (countResult[0]?.count ?? 0) === 0 ? "admin" : "child";

          // Create a default family for the new user if none exists
          const countFamilies = await db.select({ count: count() }).from(schema.families).limit(1);
          if ((countFamilies[0]?.count ?? 0) === 0) {
            const familySlug = `family-${Date.now()}`;
            await rawInsert("families", {
              id: `family-${Date.now()}`,
              name: `${name}'s Family`,
              slug: familySlug,
              week_start_day: 0,
              teams_enabled: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
            // Update role to reflect first user in this family
            role = "admin";
          }
        }
      } catch (dbError) {
        // Silently fail — user is created in Supabase Auth anyway
      }

      // Generate a random fake user ID for dev mode
      const userId = `dev-user-${crypto.randomUUID()}`;

      // Create DB user record if database is available
      try {
        const db = await initDb();
        if (db) {
          // Find or create family
          let targetFamilyId: string | null = null;
          const families = await db.select().from(schema.families).limit(1);
          if (families[0]) {
            targetFamilyId = families[0].id;
          } else {
            const slug = `family-${Date.now()}`;
            const newFamily = await rawInsert("families", {
              id: `family-${Date.now()}`,
              name: `${name}'s Family`,
              slug,
              week_start_day: 0,
              teams_enabled: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
            targetFamilyId = newFamily?.id || null;
          }

          await rawInsert("users", {
            id: userId,
            email: email || null,
            name: name,
            role: role,
            avatar_url: null,
            family_id: targetFamilyId,
            points_total: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          familyId = targetFamilyId;
        }
      } catch (dbError) {
        // Silently fail — user is created in Supabase Auth anyway
      }

      const session = createDevSession({ userId });
      session.user.role = role;
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

    // ─── Production Mode: Use Supabase Auth ─────────────────────

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
          // Check if any users exist to determine role (first user = admin)
          const countResult = await db.select({ count: count() }).from(schema.users).limit(1);
          const role = (countResult[0]?.count ?? 0) === 0 ? "admin" : "child";

          // Create a default family for the new user
          const familyName = body.name ? `${body.name}'s Family` : "My Family";
          const familySlug = `family-${Date.now()}`;
          
          const newFamily = await rawInsert("families", {
            id: `family-${Date.now()}`,
            name: familyName,
            slug: familySlug,
            week_start_day: 0,
            teams_enabled: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          
          familyId = newFamily?.id || null;

          // Create or update user record in users table with correct role
          await rawInsert("users", {
            id: userId,
            email: userEmail,
            name: body.name,
            role: role,
            avatar_url: null,
            family_id: familyId || null,
            points_total: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        } else {
          familyId = existingUserWithFamily.familyId;

          // Update role if user was previously child and this is now their first real signup
          const existingUser = (await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1))[0];
          if (existingUser && existingUser.role !== "admin") {
            await rawInsert("users", {
              id: userId,
              email: userEmail,
              name: body.name,
              role: existingUser.role,
              avatar_url: null,
              family_id: familyId || null,
              points_total: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
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
    
    if (err instanceof Error) {
      return NextResponse.json(
        { 
          error: "An unexpected error occurred",
          details: process.env.NODE_ENV === "development" ? err.message : undefined 
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
    // ─── Dev Mode: Check dev session cookie ─────────────────────
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

    // ─── Production Mode: Use Supabase Auth ─────────────────────

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
