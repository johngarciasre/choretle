import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";

/**
 * Sign up a new user with email and password using Supabase Auth
 * 
 * This endpoint:
 * 1. Creates a user account in Supabase Auth
 * 2. Sends a confirmation email (if email confirmation is enabled)
 * 3. Returns the session token for subsequent requests
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
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
 * GET endpoint for sign-up page (returns the current session if logged in)
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
    console.error("Sign up GET failed:", error);
    return NextResponse.json({ authenticated: false, error: "Failed to check session" }, { status: 500 });
  }
}
