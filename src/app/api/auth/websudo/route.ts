import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";
import { error } from "@/lib/logger.server";
import { getDb } from "@/db";
import { clientKey, clearAttempts, tooManyAttempts } from "@/lib/rate-limit";

const WEBSUDO_COOKIE = "webserversudo-session";
const ELEVATION_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface WebsudoPayload {
  userId: string;
  email: string;
  name: string;
  exp: number;
}

/**
 * Sign a websudo payload into a cookie value.
 */
function signWebsudo(payload: WebsudoPayload): string {
  const secret = process.env.WEBSUDO_SECRET;
  if (!secret) {
    error("[websudo] WEBSUDO_SECRET is not configured. Aborting.");
    throw new Error("WEBSUDO_SECRET environment variable must be set");
  }
  const json = JSON.stringify(payload);
  const hash = crypto.createHmac("sha256", secret).update(json).digest("hex");
  return `${json}.${hash}`;
}

/**
 * Verify and parse a websudo cookie value.
 */
function verifyWebsudo(cookieValue?: string): WebsudoPayload | null {
  if (!cookieValue) return null;

  try {
    const [json, hash] = cookieValue.split(".");
    if (!json || !hash) return null;

    const payload: WebsudoPayload = JSON.parse(json);
    
    // Check expiration
    if (Date.now() > payload.exp) return null;

    // Verify signature
    const secret = process.env.WEBSUDO_SECRET;
    if (!secret) {
    error("[websudo] WEBSUDO_SECRET is not configured. Aborting.");
      throw new Error("WEBSUDO_SECRET environment variable must be set");
    }
    const expectedHash = crypto.createHmac("sha256", secret).update(json).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expectedHash, "hex"))) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Set websudo elevated session cookie.
 */
function setWebsudoCookie(responseHeaders: Headers, payload: WebsudoPayload): void {
  const signed = signWebsudo(payload);
  responseHeaders.set(
    "set-cookie",
    `${WEBSUDO_COOKIE}=${signed}; path=/; secure=true; httponly=true; sameSite=lax`,
  );
}

async function POST(request: NextRequest) {
  const body = await request.json();
  const password = (body?.password ?? "").toString();

  if (!password) {
    return NextResponse.json(
      { error: "Password is required" },
      { status: 400 },
    );
  }

  // Get the current user from the request cookies (they must already be logged in)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // Cookies are returned on the response below, so nothing to stage here.
        setAll(_cookiesToSet) {},
      },
    },
  );

  // Get current session to find the user
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json(
      { error: "No active session. Please log in again." },
      { status: 401 },
    );
  }

  const attemptKey = clientKey(request, "websudo");
  if (tooManyAttempts(attemptKey)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  // Only a parent/admin may elevate. Role comes from our users table.
  const rawDb = getDb();
  const dbUser = rawDb?.prepare(`SELECT role FROM memberships WHERE user_id = ?`).get(session.user.id) as any;
  if (!dbUser || !["parent", "admin"].includes(dbUser.role)) {
    return NextResponse.json({ error: "Parent access required" }, { status: 403 });
  }

  // Verify the password by attempting to sign in
  const signInResult = await supabase.auth.signInWithPassword({
    email: session.user.email ?? "",
    password,
  });

  if (signInResult.error) {
    return NextResponse.json(
      { error: "Incorrect password" },
      { status: 401 },
    );
  }
  clearAttempts(attemptKey);

  // Set elevated session cookie
  const payload: WebsudoPayload = {
    userId: session.user.id,
    email: session.user.email || "",
    name: session.user.user_metadata?.name || session.user.email || "",
    exp: Date.now() + ELEVATION_TTL_MS,
  };

  const response = NextResponse.json({
    ok: true,
    message: "Elevation successful",
  });

  setWebsudoCookie(response.headers, payload);
  return response;
}

async function GET(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") || "";
  const setCookie = cookieHeader.split(";").find((c) => c.includes(WEBSUDO_COOKIE));

  if (!setCookie) {
    return NextResponse.json({ elevated: false });
  }

  const value = setCookie.replace(`${WEBSUDO_COOKIE}=`, "").trim();
  const payload = verifyWebsudo(value);

  if (!payload) {
    return NextResponse.json({ elevated: false });
  }

  return NextResponse.json({
    elevated: true,
    user: {
      id: payload.userId,
      email: payload.email,
      name: payload.name,
    },
  });
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
const POST_impl = withTenant(POST);
export { POST_impl as POST };
