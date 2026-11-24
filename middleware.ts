import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { getDevUserFromRequest, createDevSession, setDevSessionCookie } from "@/lib/dev-auth";

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
];

const WEBSUDO_COOKIE = "webserversudo-session";

interface AuthHeaders {
  userId: string;
  email: string;
  role: string;
  familyId: string;
}

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

/**
 * Verify a websudo elevation cookie. Returns the payload, or null.
 * Refuses to verify without WEBSUDO_SECRET — there is no default secret.
 */
async function readWebsudoAuth(request: NextRequest): Promise<Record<string, unknown> | null> {
  const secret = process.env.WEBSUDO_SECRET;
  if (!secret) return null;

  const cookieHeader = request.headers.get("cookie") || "";
  const setCookie = cookieHeader.split(";").find((c) => c.includes(WEBSUDO_COOKIE));
  if (!setCookie) return null;

  try {
    const value = setCookie.replace(`${WEBSUDO_COOKIE}=`, "").trim();
    const dot = value.lastIndexOf(".");
    if (dot <= 0) return null;

    const json = value.slice(0, dot);
    const hash = value.slice(dot + 1);
    const payload = JSON.parse(json);
    if (Date.now() >= payload.exp) return null;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(json));
    const expectedHash = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (hash.length !== expectedHash.length) return null;
    let diff = 0;
    for (let i = 0; i < hash.length; i++) {
      diff |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
    }
    return diff === 0 ? payload : null;
  } catch {
    return null;
  }
}

function setNoCacheHeaders(response: NextResponse): void {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
}

/**
 * Build a response that carries the auth identity to the route handler.
 * Next.js only forwards headers to handlers when they are set on the
 * request passed to NextResponse.next({ request }), not on the response.
 */
function nextWithAuth(request: NextRequest, auth: AuthHeaders): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", auth.userId);
  requestHeaders.set("x-email", auth.email);
  requestHeaders.set("x-role", auth.role);
  requestHeaders.set("x-family-id", auth.familyId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-middleware-test", "running");
  setNoCacheHeaders(response);
  return response;
}

export async function middleware(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const pathname = requestUrl.pathname;

  // ─── Check if route is public ────────────────────────────────────────
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
  const isPublicApiRoute = PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route));

  if (isPublicRoute || isPublicApiRoute) {
    const response = NextResponse.next();
    response.headers.set("x-middleware-test", "running");
    return response;
  }

  // ─── Production Mode: Verify Supabase session and set auth headers ──
  if (!isDevMode()) {
    const websudo = await readWebsudoAuth(request);
    if (websudo) {
      return nextWithAuth(request, {
        userId: String(websudo.userId || ""),
        email: String(websudo.email || ""),
        role: "superadmin",
        familyId: "",
      });
    }

    const result = await getSessionFromSupabase(request);

    if (result?.data?.session) {
      const user = result.data.session.user;

      if (pathname === "/") {
        const redirect = NextResponse.redirect(new URL("/family", request.url));
        setNoCacheHeaders(redirect);
        return redirect;
      }

      // familyId and the authoritative role are resolved from the database by
      // verifyAuth(); middleware runs on the edge and cannot open SQLite.
      return nextWithAuth(request, {
        userId: user?.id || "",
        email: user?.email || "",
        role: (user?.user_metadata?.role as string) || "child",
        familyId: "",
      });
    }

    // No valid session — redirect to signin
    const redirect = NextResponse.redirect(new URL("/auth/signin", request.url));
    setNoCacheHeaders(redirect);
    return redirect;
  }

  // ─── Dev Mode: Check or auto-create dev session cookie ──────────────
  let devUser = await getDevUserFromRequest(request);
  let newSession = null;

  if (!devUser) {
    // Auto-login: create a fresh random identity on first visit (e.g. after server restart).
    newSession = createDevSession();
    devUser = newSession.user;
  }

  // Redirect dev users from landing page to family
  if (pathname === "/") {
    const redirectUrl = devUser.familyId ? `/family/${devUser.familyId}` : "/family";
    const redirect = NextResponse.redirect(new URL(redirectUrl, request.url));
    setNoCacheHeaders(redirect);
    if (newSession) await setDevSessionCookie(redirect.headers, newSession);
    return redirect;
  }

  // Set user headers for protected routes (also auth pages, so they can render)
  const response = nextWithAuth(request, {
    userId: devUser.id,
    email: devUser.email,
    role: devUser.role,
    familyId: devUser.familyId || "",
  });

  if (newSession) {
    await setDevSessionCookie(response.headers, newSession);
  }

  return response;
}

export const config = {
  matcher: "/(.*)",
};
