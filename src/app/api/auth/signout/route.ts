import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { clearDevSessionCookie, parseDevSession, DEV_COOKIE_NAME } from "@/lib/dev-auth";

/**
 * Sign out user and clear session cookies.
 * In dev mode (AUTH_MODE=dev), clears the dev session cookie.
 */
export async function POST(request: NextRequest) {
  try {
    // ─── Dev Mode: Clear dev session cookie ────────────────
    if (process.env.AUTH_MODE === "dev") {
      const response = NextResponse.json(
        { 
          ok: true, 
          message: "Successfully logged out (dev mode)" 
        },
        { status: 200 }
      );

      // Clear the dev session cookie by setting it to empty
      clearDevSessionCookie(response.headers);

      return response;
    }

    // ─── Production Mode: Use Supabase Auth ────────────────
    
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
 * GET endpoint for signout page (returns the current session if logged in).
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
        },
      });
    }

    return NextResponse.json({ authenticated: false });
  } catch (error) {
    console.error("Sign out GET failed:", error);
    return NextResponse.json({ authenticated: false, error: "Failed to check session" }, { status: 500 });
  }
}
