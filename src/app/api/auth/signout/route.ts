import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { clearDevSessionCookie, parseDevSession, DEV_COOKIE_NAME } from "@/lib/dev-auth";
import { error } from "@/lib/logger.server";

/**
 * Check if Supabase credentials are properly configured.
 * Requires both URL and anon key to be set.
 */
function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Sign out user and clear session cookies.
 * In dev mode (AUTH_MODE=dev), clears the dev session cookie.
 * Supports global signout via body { type: 'global' } to terminate all sessions.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const isGlobal = body.type === "global";

    // ─── Dev Mode: Clear dev session cookie ────────────────
    if (process.env.AUTH_MODE === "dev") {
      const response = NextResponse.json(
        { 
          ok: true, 
          message: "Successfully logged out (dev mode)" 
        },
        { status: 200 }
      );

      clearDevSessionCookie(response.headers);
      // Set a persistent flag to prevent middleware from auto-logging back in (no httpOnly for dev)
      response.cookies.set("dev-signout", "true", { path: "/", secure: false });
      return response;
    }

    // ─── Production Mode: Use Supabase Auth ────────────────
    
    if (!hasSupabaseConfig()) {
      return NextResponse.json(
        { 
          ok: true, 
          message: "No active session to log out" 
        },
        { status: 200 }
      );
    }

    const supabase = await getSupabaseMiddlewareClient(request);

    if (isGlobal) {
      await supabase.auth.signOut({ scope: "global" });
    } else {
      await supabase.auth.signOut();
    }

    return NextResponse.json(
      { 
        ok: true, 
        message: isGlobal ? "Successfully logged out from all sessions" : "Successfully logged out" 
      },
      { status: 200 }
    );
  } catch (e) {
    error("Sign out failed", { err: e });
    
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
  } catch (e) {
    error("Sign out GET failed", { err: e });
    return NextResponse.json({ authenticated: false, error: "Failed to check session" }, { status: 500 });
  }
}
