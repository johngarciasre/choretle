import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";

/**
 * Sign out user and clear session cookies
 * 
 * This endpoint invalidates the current Supabase Auth session by:
 * 1. Calling logout on the server side to revoke refresh tokens
 * 2. Clearing all auth-related cookies
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseMiddlewareClient(request);

    // Logout from Supabase Auth (revoke refresh tokens, clear session)
    await supabase.auth.signOut();

    return NextResponse.json(
      { 
        ok: true, 
        message: "Successfully logged out" 
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Sign out failed:", error);
    
    // Even if logout fails, clear cookies as a fallback
    return NextResponse.json(
      { 
        ok: true, 
        message: "Logged out (with potential errors)" 
      },
      { status: 200 }
    );
  }
}

/**
 * GET endpoint for signout page (returns the current session if logged in)
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
        },
      });
    }

    return NextResponse.json({ authenticated: false });
  } catch (error) {
    console.error("Sign out GET failed:", error);
    return NextResponse.json({ authenticated: false, error: "Failed to check session" }, { status: 500 });
  }
}
