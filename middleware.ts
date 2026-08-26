import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { getDevUserFromRequest } from "@/lib/dev-auth";

const PUBLIC_ROUTES = [
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

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function isDevMode(): boolean {
  return process.env.AUTH_MODE === "dev";
}

async function getSessionFromSupabase(request: NextRequest) {
  if (!hasSupabaseConfig()) return null;
  
  try {
    const supabase = await getSupabaseMiddlewareClient(request);
    return await supabase.auth.getSession();
  } catch {
    return null;
  }
}

async function checkWebsudoAuth(request: NextRequest): Promise<boolean> {
  const cookieHeader = request.headers.get("cookie") || "";
  const setCookie = cookieHeader.split(";").find((c) => c.includes("webserversudo-session"));

  if (!setCookie) return false;

  try {
    const value = setCookie.replace("webserversudo-session=", "").trim();
    const [json, hash] = value.split(".");
    
    if (!json || !hash) return false;
    
    const payload = JSON.parse(json);
    if (Date.now() >= payload.exp) return false;

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
    
    if (hash.length !== expectedHash.length) return false;
    for (let i = 0; i < hash.length; i++) {
      if (hash.charCodeAt(i) !== expectedHash.charCodeAt(i)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function setNoCacheHeaders(response: NextResponse): void {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
}

export async function middleware(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const pathname = requestUrl.pathname;
  console.log("[MID]", pathname, "devMode=", process.env.AUTH_MODE === "dev");

  // ─── Check if route is public ────────────────────────────────────────
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
  const isPublicApiRoute = PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route));

  if (isPublicRoute || isPublicApiRoute) {
    return NextResponse.next();
  }

  // ─── Production Mode: Verify Supabase session and set auth headers ──
  if (!isDevMode()) {
    const websudoValid = await checkWebsudoAuth(request);
    if (websudoValid) {
      const cookieHeader = request.headers.get("cookie") || "";
      const setCookie = cookieHeader.split(";").find((c) => c.includes("webserversudo-session"));
      if (setCookie) {
        try {
          const value = setCookie.replace("webserversudo-session=", "").trim();
          const [json] = value.split(".");
          const payload: Record<string, unknown> = JSON.parse(json);
          
          const response = NextResponse.next();
          response.headers.set("x-user-id", String(payload.userId || ""));
          response.headers.set("x-email", String(payload.email || ""));
          response.headers.set("x-role", "superadmin");
          response.headers.set("x-family-id", "");
          setNoCacheHeaders(response);
          return response;
        } catch {
          // Invalid websudo session, fall through to redirect
        }
      }
    }

    const result = await getSessionFromSupabase(request);

    if (result?.data?.session) {
      const response = NextResponse.next();
      setNoCacheHeaders(response);
      
      // Set user info from Supabase session (familyId will be resolved by API routes via /api/auth/me)
      response.headers.set("x-user-id", result.data.session.user?.id || "");
      response.headers.set("x-email", result.data.session.user?.email || "");
      response.headers.set("x-role", "child");
      
      // Redirect authenticated users from landing page to family
      if (pathname === "/") {
        return NextResponse.redirect(new URL("/family", request.url));
      }
      
      return response;
    }

    // No valid session — redirect to signin
    const response = NextResponse.redirect(new URL("/auth/signin", request.url));
    setNoCacheHeaders(response);
    return response;
  }

  // ─── Dev Mode: Check dev session cookie ──────────────────────
  const devUser = getDevUserFromRequest(request);
  const cookieHeader = request.headers.get("cookie") || "";
  const isSignedOut = cookieHeader.includes("dev-signout=true");

  if (!devUser || isSignedOut) {
    const response = NextResponse.redirect(new URL("/auth/signin", request.url));
    setNoCacheHeaders(response);
    return response;
  }

  // Redirect dev users from landing page to family
  if (pathname === "/" && devUser) {
    const redirectUrl = devUser.familyId ? `/family/${devUser.familyId}` : "/family";
    const response = NextResponse.redirect(new URL(redirectUrl, request.url));
    setNoCacheHeaders(response);
    return response;
  }

  // Set user headers for protected routes
  let userId: string | null = devUser.id;
  let familyId: string | null = devUser.familyId || null;

  const response = NextResponse.next();
  response.headers.set("x-user-id", userId!);
  response.headers.set("x-email", devUser.email);
  response.headers.set("x-role", devUser.role);
  response.headers.set("x-family-id", familyId!);
  setNoCacheHeaders(response);

  return response;
}

export const config = {
  matcher: ["/(.*.*)"],
};
