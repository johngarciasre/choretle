import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { createDevSession, setDevSessionCookie, getDevUserFromRequest } from "@/lib/dev-auth";

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

const PUBLIC_API_ROUTES = [
  "/api/auth/signin",
  "/api/auth/signup",
  "/api/auth/signout",
  "/api/auth/me",
  "/api/family/join",
  "/api/schedules/generate",
];

function isDevMode(): boolean {
  return process.env.AUTH_MODE === "dev";
}

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
  if (isDevMode()) {
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
  
  const supabase = await getSupabaseMiddlewareClient(request);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Redirect to sign in page
    const signInUrl = new URL("/auth/signin", request.url);
    return NextResponse.redirect(signInUrl);
  }

  // ─── User is authenticated ──────────────────────────────────────────
  const response = NextResponse.next();
  
  response.headers.set("x-user-id", user.id);
  if (user.email) {
    response.headers.set("x-email", user.email);
  }
  if (user.user_metadata?.family_id) {
    response.headers.set("x-family-id", user.user_metadata.family_id);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
