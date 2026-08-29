/**
 * Development Auth Bypass Module
 * 
 * When AUTH_MODE=dev, this module provides a mock authentication system
 * that lets you demo the app without Supabase. It generates random fake users
 * and manages them via cookies.
 */

// ─── Types ──────────────────────────────────────────────────────

export interface DevUser {
  id: string;
  email: string;
  name: string;
  role: string;
  familyId: string | null;
}

export interface DevSession {
  user: DevUser;
}

// ─── Constants ──────────────────────────────────────────────────

export const DEV_COOKIE_NAME = "dev-session";

/**
 * Generate a random fake UUID for dev mode users.
 */
function generateFakeId(): string {
  return `dev-user-${crypto.randomUUID()}`;
}

// ─── Session Management ──────────────────────────────────────────────

/**
 * Creates a mock session for development with a random user ID.
 */
export function createDevSession(options?: { userId?: string }): DevSession {
  const userId = options?.userId || generateFakeId();
  
  return { 
    user: {
      id: userId,
      email: options?.userId ? `${options.userId}@choretle.dev` : `user-${Math.random().toString(36).substring(2, 8)}@choretle.dev`,
      name: options?.userId || "Dev User",
      role: "child", // default; actual role determined by DB on first signup
      familyId: null,
    }
  };
}

/**
 * Parses and validates a dev session from a cookie value.
 */
export function parseDevSession(cookieValue?: string): DevUser | null {
  if (!cookieValue) return null;

  try {
    const decoded = JSON.parse(decodeURIComponent(cookieValue));
    // Session may be stored as full { user } wrapper or flat DevUser directly
    const u = decoded.user || decoded;
    return {
      id: u.sub ?? u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      familyId: u.familyId,
    };
  } catch {
    return null;
  }
}

/**
 * Gets the dev user from the request cookies.
 */
export function getDevUserFromRequest(request: Request): DevUser | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const setCookie = cookieHeader.split(";").find((c) => c.includes(DEV_COOKIE_NAME));

  if (!setCookie) return null;

  const value = setCookie.replace(`${DEV_COOKIE_NAME}=`, "").trim();
  return parseDevSession(value);
}

/**
 * Sets a dev session cookie on response headers.
 * Uses encodeURIComponent for reliable cookie values (URL-safe).
 */
export function setDevSessionCookie(
  responseHeaders: Headers, 
  session: DevSession
): void {
  const encoded = encodeURIComponent(JSON.stringify(session));
  responseHeaders.set(
    "set-cookie",
    `${DEV_COOKIE_NAME}=${encoded}; path=/; secure=false; httpOnly=true`
  );
}

/**
 * Sets a dev session cookie on response headers (alternative name).
 */
export function setDevSessionOnResponse(
  responseHeaders: Headers, 
  session: DevSession
): void {
  const encoded = encodeURIComponent(JSON.stringify(session));
  responseHeaders.set(
    "set-cookie",
    `${DEV_COOKIE_NAME}=${encoded}; path=/; secure=false; httpOnly=true`
  );
}

/**
 * Clears the dev session cookie from response headers.
 */
export function clearDevSessionCookie(responseHeaders: Headers): void {
  responseHeaders.set(
    "set-cookie",
    `${DEV_COOKIE_NAME}=; path=/; secure=false; httpOnly=true`
  );
}

/**
 * Verifies auth for a request in dev mode.
 * Returns the user if found, or null if not authenticated.
 */
export async function verifyDevAuth(
  request: Request
): Promise<DevUser | { error: string }> {
  const cookieHeader = request.headers.get("cookie") || "";
  const setCookie = cookieHeader.split(";").find((c) => c.includes(DEV_COOKIE_NAME));

  if (!setCookie) {
    return { error: "No dev session cookie found" };
  }

  const value = setCookie.replace(`${DEV_COOKIE_NAME}=`, "").trim();
  const user = parseDevSession(value);

  if (!user) {
    return { error: "Invalid dev session" };
  }

  return user;
}

/**
 * Gets a demo user for the request, creating one if needed.
 */
export async function getDemoDevUser(
  request: Request
): Promise<DevUser | { error: string }> {
  const existing = getDevUserFromRequest(request);
  if (existing) return existing;

  // Create a default session for the user
  const session = createDevSession();
  return session.user;
}
