import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { createDevSession, setDevSessionCookie, parseDevSession, DEV_COOKIE_NAME } from "@/lib/dev-auth";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Check if Supabase credentials are properly configured.
 */
function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // ─── Dev Mode: Use mock user ────────────────────────────────
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
      return response;
    }

    // ─── Production Mode: Use Supabase Auth ──────────────────────
    
    if (!hasSupabaseConfig()) {
      return NextResponse.json(
        { error: "Server configuration error: Supabase credentials not found. Please check environment variables." },
        { status: 500 }
      );
    }

    // Validate input
    if (!body?.email || !body?.password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseMiddlewareClient(request);

    // Sign in with password using Supabase Auth
    const signInResult = await supabase.auth.signInWithPassword({
      email: body.email.toLowerCase().trim(),
      password: body.password,
    });

    if (signInResult.error) {
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
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 500 }
      );
    }

    const userId = signInResult.data.session.user.id;
    const userEmail = signInResult.data.session.user.email || null;
    const userRole = signInResult.data.session.user.user_metadata?.role || "child";

    // Create or update user record in users table and ensure family membership exists
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
          // Create a default family for the user
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

        // Create or update user record in users table
        const existingUser = await db.select().from(schema.users).where(eq(schema.users.id, userId)).first();
        
        if (!existingUser) {
          await db.insert(schema.users).values({
            id: userId,
            email: userEmail,
            name: "", // Will be populated via profile endpoint later
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
      // Silently fail - user is authenticated in Supabase Auth anyway
    }

    const response = NextResponse.json(
      { 
        ok: true, 
        userId,
        email: userEmail,
        role: userRole,
        familyId: familyId || null,
        message: "Sign in successful"
      },
      {
        status: 200,
        headers: {
          "x-user-id": userId,
          "x-email": userEmail || "",
          "x-role": userRole,
          "x-family-id": familyId || "",
        }
      }
    );

    return response;
  } catch (error) {
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
      { error: "Sign in failed" },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for sign-in page (returns the current session if logged in).
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
