import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const SUPERADMIN_COOKIE = "superadmin-session";

interface SuperadminUser {
  id: string;
  email: string;
  name: string;
  role: "superadmin";
  familyId: null;
}

interface SuperadminSession {
  user: SuperadminUser;
}

/**
 * Parse and validate a superadmin session from a cookie value.
 */
function parseSuperadminSession(cookieValue?: string): SuperadminUser | null {
  if (!cookieValue) return null;

  try {
    const decoded = JSON.parse(decodeURIComponent(cookieValue));
    const u = decoded.user || decoded;
    return {
      id: u.sub ?? u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      familyId: null,
    };
  } catch {
    return null;
  }
}

/**
 * Set a superadmin session cookie on response headers.
 */
function setSuperadminSessionCookie(
  responseHeaders: Headers,
  session: SuperadminSession,
): void {
  const encoded = encodeURIComponent(JSON.stringify(session));
  responseHeaders.set(
    "set-cookie",
    `${SUPERADMIN_COOKIE}=${encoded}; path=/; secure=true; httpOnly=true; sameSite=lax`,
  );
}

/**
 * Clear the superadmin session cookie.
 */
function clearSuperadminSessionCookie(responseHeaders: Headers): void {
  responseHeaders.set(
    "set-cookie",
    `${SUPERADMIN_COOKIE}=; path=/; secure=true; httpOnly=true; sameSite=lax`,
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const username = (body?.username ?? "").toString().trim();
  const password = (body?.password ?? "").toString();

  const expectedUsername = process.env.SUPERADMIN_USERNAME ?? "";
  const expectedPassword = process.env.SUPERADMIN_PASSWORD ?? "";

  if (!expectedUsername || !expectedPassword) {
    return NextResponse.json(
      { error: "Superadmin is not configured. Set SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD env vars." },
      { status: 501 },
    );
  }

  if (username !== expectedUsername || !crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expectedPassword))) {
    return NextResponse.json({ error: "Invalid superadmin credentials" }, { status: 401 });
  }

  const user: SuperadminUser = {
    id: "superadmin",
    email: expectedUsername,
    name: "Superadmin",
    role: "superadmin",
    familyId: null,
  };

  const session: SuperadminSession = { user };

  const response = NextResponse.json({
    ok: true,
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  setSuperadminSessionCookie(response.headers, session);
  return response;
}

export async function GET(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") || "";
  const setCookie = cookieHeader.split(";").find((c) => c.includes(SUPERADMIN_COOKIE));

  if (!setCookie) {
    return NextResponse.json({ authenticated: false });
  }

  const value = setCookie.replace(`${SUPERADMIN_COOKIE}=`, "").trim();
  const user = parseSuperadminSession(value);

  if (!user) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
}
