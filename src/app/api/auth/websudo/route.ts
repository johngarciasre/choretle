import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";

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
  const secret = process.env.WEBSUDO_SECRET || "dev-websudo-secret-change-me";
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
    const secret = process.env.WEBSUDO_SECRET || "dev-websudo-secret-change-me";
    const expectedHash = crypto.createHmac("sha256", secret).update(json).digest("hex");
    if (hash !== expectedHash) return null;

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
    `${WEBSUDO_COOKIE}=${signed}; path=/; secure=true; httponly=true`,
  );
}

/**
 * Clear websudo cookie.
 */
function clearWebsudoCookie(responseHeaders: Headers): void {
  responseHeaders.set(
    "set-cookie",
    `${WEBSUDO_COOKIE}=; path=/; secure=true; httponly=true`,
  );
}

export async function POST(request: NextRequest) {
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
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet) {
            const { name, value, options } = cookie;
            let cookieStr = `${name}=${value}`;
            if (options) {
              for (const [key, val] of Object.entries(options)) {
                cookieStr += `; ${key}=${val}`;
              }
            }
          }
        },
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

export async function GET(request: NextRequest) {
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
