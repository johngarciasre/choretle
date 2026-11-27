import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { verifyDevSession, DEV_COOKIE_NAME } from "@/lib/dev-auth";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";
import { cookieOptions, revokeSession, sessionCookieNames } from "@/lib/session";

/** Clear the PIN and picker cookies alongside the Supabase session. */
function clearSessionCookies(response: NextResponse): NextResponse {
  const names = sessionCookieNames();
  for (const name of [names.kid, names.tablet, names.device]) {
    response.cookies.set(name, "", cookieOptions(0));
  }
  return response;
}

/**
 * Check if Supabase credentials are properly configured.
 */
function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Sign out user and clear session cookies.
 * In dev mode (AUTH_MODE=dev), clears the dev session cookie.
 * Supports global signout via body { type: 'global' } to terminate all sessions.
 */
async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const isGlobal = body.type === "global";

    // A PIN session is revoked server-side; clearing the cookie alone would
    // leave a live row behind on a tablet that was walked away from.
    const sessionAuth = await verifyAuth(request);
    if (sessionAuth?.sessionId) await revokeSession(sessionAuth.sessionId);

    // ─── Dev Mode: Clear dev session cookie & set signout flag ────────────────
    if (process.env.AUTH_MODE === "dev") {
      const response = NextResponse.json(
        {
          ok: true,
          message: "Successfully logged out (dev mode)"
        },
        { status: 200 }
      );

      // Use raw Set-Cookie headers to reliably clear dev session and set signout flag
      // response.cookies.delete() doesn't work in Node runtime API routes -> middleware
      response.headers.append("Set-Cookie", `${DEV_COOKIE_NAME}=; path=/; secure=false; httpOnly=true`);
      response.headers.append("Set-Cookie", "dev-signout=true; path=/; secure=false; httpOnly=true");
      response.headers.append("Set-Cookie", "choretle_mode=; path=/; secure=false; httpOnly=true");
      return clearSessionCookies(response);
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

    // Also clear any Supabase-related cookies that might persist after signOut()
    const response = NextResponse.json(
      { 
        ok: true, 
        message: isGlobal ? "Successfully logged out from all sessions" : "Successfully logged out" 
      },
      { status: 200 }
    );

    // Clear all sb-* cookies (standard Supabase + custom ones set by signin)
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith("sb-")) {
        response.cookies.delete(cookie.name);
      }
    }

    return clearSessionCookies(response);
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
async function GET(request: NextRequest) {
  try {
    // ─── Dev Mode: Check dev session cookie ────────────────
    if (process.env.AUTH_MODE === "dev") {
      const cookieHeader = request.headers.get("cookie") || "";
      const setCookie = cookieHeader.split(";").find((c) => c.includes(DEV_COOKIE_NAME));

      if (!setCookie) {
        return NextResponse.json({ authenticated: false });
      }

      const value = setCookie.replace(`${DEV_COOKIE_NAME}=`, "").trim();
      const user = await verifyDevSession(value);

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

const GET_impl = withTenant(GET);
export { GET_impl as GET };
const POST_impl = withTenant(POST);
export { POST_impl as POST };
