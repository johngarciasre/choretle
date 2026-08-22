import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { createDevSession, setDevSessionCookie, parseDevSession, DEV_COOKIE_NAME } from "@/lib/dev-auth";

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

      // Create response object to set headers on
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

      // Set the dev session cookie so subsequent requests are authenticated
      setDevSessionCookie(response.headers, session);

      return response;
    }

    // ─── Production Mode: Use Supabase Auth ────────────────
    
    // Validate input
    if (!body?.email || !body?.password || !body?.name) {
      return NextResponse.json(
        { error: "Email, password, and name are required" },
        { status: 400 }
      );
    }

    // Initialize Supabase client for middleware
    const supabase = await getSupabaseMiddlewareClient(request);

    // Sign up with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email: body.email.toLowerCase().trim(),
      password: body.password,
      options: {
        data: {
          name: body.name,
          role: "child", // Default role - can be overridden in production
        },
      },
    });

    if (error) {
      console.error("Sign up error:", error);
      
      // Handle specific error cases
      if (error.message.includes("Email already registered")) {
        return NextResponse.json(
          { error: "An account with this email already exists" },
          { status: 409 }
        );
      }
      
      if (error.message.includes("Weak password")) {
        return NextResponse.json(
          { error: "Password is too weak. Please use at least 6 characters." },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: error.message || "Failed to sign up" },
        { status: 400 }
      );
    }

    // Check if user creation was successful
    if (!data?.user) {
      console.error("No user created in Supabase Auth");
      return NextResponse.json(
        { error: "User registration failed" },
        { status: 500 }
      );
    }

    // If auto confirmation is disabled, we need to prompt the user to verify email
    if (data.user.identities?.length === 0) {
      // User needs to verify their email before they can log in
      return NextResponse.json(
        { 
          ok: true, 
          message: "Registration successful. Please check your email to confirm your account.",
          requiresEmailConfirmation: true,
        },
        { status: 200 }
      );
    }

    // User is authenticated immediately (auto-confirm enabled or email verified)
    const userId = data.user.id;
    const userEmail = data.user.email || null;

    return NextResponse.json(
      { 
        ok: true, 
        userId,
        email: userEmail,
        message: "Sign up successful. Welcome to Choretle!",
        requiresEmailConfirmation: false,
      },
      {
        status: 200,
        headers: {
          "x-user-id": userId,
          "x-email": userEmail || "",
        }
      }
    );
  } catch (error) {
    console.error("Sign up failed:", error);
    
    // Handle unexpected errors
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
 * In dev mode, checks for dev session cookie.
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
    
    const supabase = await getSupabaseMiddlewareClient(request);
    
    // Get the current session
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
    console.error("Sign up GET failed:", error);
    return NextResponse.json({ authenticated: false, error: "Failed to check session" }, { status: 500 });
  }
}
