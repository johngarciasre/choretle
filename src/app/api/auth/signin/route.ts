import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";

/**
 * Sign in with email and password using Supabase Auth
 * 
 * This endpoint authenticates users against Supabase Auth and sets up
 * cookie-based sessions for subsequent requests.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    if (!body?.email || !body?.password) {
      return NextResponse.json(
        { error: "Email and password are required", status: 400 },
        { status: 400 }
      );
    }

    // Initialize Supabase client for middleware
    const supabase = await getSupabaseMiddlewareClient(request);

    // Sign in with password using Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email.toLowerCase().trim(),
      password: body.password,
    });

    if (error) {
      console.error("Sign in error:", error);
      
      // Handle specific error cases
      if (error.message.includes("Invalid login credentials")) {
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 }
        );
      }
      
      if (error.message.includes("Email not confirmed")) {
        return NextResponse.json(
          { error: "Please verify your email address before signing in" },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: error.message || "Failed to sign in" },
        { status: 401 }
      );
    }

    // Verify we got a valid session
    if (!data?.session) {
      console.error("No session returned from Supabase");
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 500 }
      );
    }

    // Extract user information from session
    const userId = data.session.user.id;
    const userEmail = data.session.user.email || null;
    const userRole = data.session.user.user_metadata?.role || "child";

    // Set auth headers for downstream API routes
    const response = NextResponse.json(
      { 
        ok: true, 
        userId,
        email: userEmail,
        role: userRole,
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

    return response;
  } catch (error) {
    console.error("Sign in failed:", error);
    
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
      { error: "Sign in failed" },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for sign-in page (returns the current session if logged in)
 */
export async function GET(request: NextRequest) {
  try {
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
    console.error("Sign in GET failed:", error);
    return NextResponse.json({ authenticated: false, error: "Failed to check session" }, { status: 500 });
  }
}
