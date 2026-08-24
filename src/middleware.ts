import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { createDevSession, setDevSessionCookie, getDevUserFromRequest } from "@/lib/dev-auth";
import nodeCrypto from "crypto";

const PUBLIC_ROUTES = [
  "/auth/signin",
  "/auth/signup", 
  "/auth/signup/verify-email",
  "/_next/static",
  "/_next/image",
  "/favicon.ico",
  "/manifest.json",
  "/apple-touch-icon.png",
];

const PUBLIC_API_ROUTES = [
  "/api/auth/signin",
  "/api/auth/signup",
  "/api/auth/signout",
  "/api/auth/me",
  "/api/auth/websudo",
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

  // ─── Redirect authenticated users away from marketing page ──────────
  if (pathname === "/" && !isDevMode()) {
    const supabase = await getSupabaseMiddlewareClient(request);
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // ─── Redirect unauthenticated users to sign in ──────────────────────
  if (!isDevMode()) {
    const supabase = await getSupabaseMiddlewareClient(request);
    const { data: { session } } = await supabase.auth.getSession();
    
    // Check for elevated websudo session as fallback
    if (!session) {
      const cookieHeader = request.headers.get("cookie") || "";
      const setCookie = cookieHeader.split(";").find((c) => c.includes("webserversudo-session"));

      if (setCookie) {
        const value = setCookie.replace("webserversudo-session=", "").trim();
        
        try {
          const [json, hash] = value.split(".");
          if (json && hash) {
            const payload = JSON.parse(json);
            
            // Check expiration
            if (Date.now() < payload.exp) {
              // Verify signature
              const secret = process.env.WEBSUDO_SECRET || "dev-websudo-secret-change-me";
              const encoder = new TextEncoder();
              const key = await crypto.subtle.importKey(
                "raw",
                encoder.encode(secret),
                { name: "HMAC", hash: "SHA-256" },
                false,
                ["sign"],
              );
              const signature = await crypto.subtle.sign(
                "HMAC",
                key,
                encoder.encode(json),
              );
              const expectedHash = Array.from(new Uint8Array(signature))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
              
              // Timing-safe comparison of the signature hash
              if (nodeCrypto.timingSafeEqual(
                Buffer.from(hash, "hex"),
                Buffer.from(expectedHash, "hex"),
              )) {
                const response = NextResponse.next();
                response.headers.set("x-user-id", payload.userId);
                response.headers.set("x-email", payload.email);
                response.headers.set("x-role", "superadmin");
                response.headers.set("x-family-id", "");
                return response;
              }
            }
          }
        } catch {
          // Invalid websudo session, fall through to redirect
        }
      }

      return NextResponse.redirect(new URL("/auth/signin", request.url));
    }
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
      familyId = devUser.familyId || null;
    } else {
      // Auto-sign in admin user
      const session = createDevSession({ userId: "dev-user-admin-001" });
      setDevSessionCookie(response.headers, session);
      response.headers.set("x-user-id", session.user.id);
      response.headers.set("x-family-id", "dev-family-001");
      userId = session.user.id;
      familyId = "dev-family-001";
    }

    // Set user headers for protected routes
    if (userId) {
      response.headers.set("x-user-id", userId);
      response.headers.set("x-email", devUser?.email || "admin@choretle.dev");
      response.headers.set("x-role", devUser?.role || "admin");
      response.headers.set("x-family-id", familyId!);
    }

    return response;
  }

  // ─── Protected route, user is authenticated ──────────────────────────
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!api/|_next/|_vercel|[\\w-]+\\.\\w+).*)",
  ],
};
