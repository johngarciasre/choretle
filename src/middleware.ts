import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { createDevSession, setDevSessionCookie, getDevUserFromRequest, DEV_COOKIE_NAME } from "@/lib/dev-auth";

// ─── Protected Routes ──────────────────────────────────────────────────
// These routes require authentication

/**
 * List of page routes that don't require authentication
 */
const PUBLIC_ROUTES = [
  "/auth/signin",
  "/auth/signup", 
  "/family",
  "/api/family/join",
  "_next/static",
  "_next/image",
  "/favicon.ico",
  "/manifest.json",
  "/apple-touch-icon.png",
];

/**
 * List of API routes that don't require authentication (public APIs)
 */
const PUBLIC_API_ROUTES = [
  "/api/auth/signin",
  "/api/auth/signup",
  "/api/auth/signout",
  "/api/family/join",
  "/api/schedules/generate",
];

/**
 * Checks if dev mode auth bypass is enabled.
 */
function isDevMode(): boolean {
  return process.env.AUTH_MODE === "dev";
}

/**
 * Checks if Supabase credentials are configured.
 * Requires both URL and anon key to be set.
 */
function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Middleware to protect routes and validate Supabase Auth sessions.
 * In dev mode (AUTH_MODE=dev), skips real auth and uses mock users.
 */
export async function middleware(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const pathname = requestUrl.pathname;

  // ─── Check if route is public ────────────────────────────────────────
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route));
  const isPublicApiRoute = PUBLIC_API_ROUTES.some(route => pathname.startsWith(route));

  if (isPublicRoute || isPublicApiRoute) {
    return NextResponse.next();
  }

  // ─── Dev Mode: Skip real auth, use mock users ──────────────────────
  if (isDevMode() || !hasSupabaseConfig()) {
    const devUser = getDevUserFromRequest(request);
    
    let userId: string | null = null;
    let familyId: string | null = null;

    // Create response object to set headers on
    const response = NextResponse.next();

    if (devUser) {
      userId = devUser.id;
      familyId = devUser.familyId;
    } else {
      // Create a default session for the user
      const session = createDevSession();
      setDevSessionCookie(response.headers, session);
      userId = session.user.id;
      familyId = session.user.familyId;
    }

    if (userId) {
      response.headers.set("x-user-id", userId);
    }
    if (familyId) {
      response.headers.set("x-family-id", familyId);
    }

    return response;
  }

  // ─── Production Mode: Use Supabase Auth ──────────────────────────
  
  // ─── Initialize Supabase client ──────────────────────────────────────
  const supabase = await getSupabaseMiddlewareClient(request);

  // ─── Get current session ──────────────────────────────────────────────
  let userId: string | null = null;
  let familyId: string | null = null;

  const { data: { session } } = await supabase.auth.getSession();
  
  if (session) {
    userId = session.user.id;
    familyId = session.user.user_metadata?.family_id || null;
    
    // Set auth headers for downstream API routes
    const response = NextResponse.next();
    if (userId) {
      response.headers.set("x-user-id", userId);
    }
    if (familyId) {
      response.headers.set("x-family-id", familyId);
    }
    
    return response;
  }

  // ─── Session is missing or expired ──────────────────────────────────
  
  // For API routes, we need to decide: redirect or 401?
  // - Auth endpoints should allow the request (they handle auth themselves)
  // - Other public API routes should return 200
  // - Protected routes should return 401
  
  const isApiRoute = pathname.startsWith("/api/");

  if (isApiRoute) {
    // Check if this is a protected API route (not in PUBLIC_API_ROUTES)
    // If it's not public and user isn't authenticated, return 401
    const isProtectedApi = !isPublicApiRoute;
    
    if (isProtectedApi) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }
    
    // This is a public API route, so we allow it but don't set auth headers
    const response = NextResponse.next();
    return response;
  }

  // ─── For page routes (non-API) ──────────────────────────────────────
  // If not authenticated and not on a public route, redirect to sign in
  
  // Check if this is an auth-related page we should redirect to
  const isAuthPage = pathname === "/auth/signin" || 
                    pathname === "/auth/signup" ||
                    pathname.startsWith("/auth/");

  if (!isAuthPage && !isPublicRoute) {
    // Redirect to sign in page
    const signInUrl = new URL("/auth/signin", request.url);
    return NextResponse.redirect(signInUrl);
  }

  // Allow the request but without auth headers (for public pages)
  const response = NextResponse.next();
  return response;
}

// ─── Route Matcher Configuration ────────────────────────────────────────
// This tells Next.js which routes should be processed by this middleware

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
