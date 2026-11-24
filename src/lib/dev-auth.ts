/**
 * Development Auth Bypass Module
 *
 * When AUTH_MODE=dev, this module provides a mock authentication system
 * that lets you demo the app without Supabase. It generates random fake users
 * and manages them via signed cookies.
 *
 * The cookie is HMAC-signed with WEBSUDO_SECRET (or a local dev fallback), and
 * it is only accepted when AUTH_MODE === "dev", so a forged cookie can never
 * authenticate against a production deployment.
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

const devSecret = (): string => process.env.WEBSUDO_SECRET || "choretle-local-dev-session";

async function hmacHex(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(devSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
 * Parses an (already signature-checked) dev session from a cookie value.
 * Not a trust boundary on its own — use verifyDevSession() for that.
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
 * Signs a dev session into a cookie value: `<encoded-json>.<hmac>`.
 */
export async function signDevSession(session: DevSession): Promise<string> {
  const json = JSON.stringify(session);
  return `${encodeURIComponent(json)}.${await hmacHex(json)}`;
}

/**
 * Verifies the HMAC on a dev session cookie and returns the user.
 */
export async function verifyDevSession(cookieValue?: string): Promise<DevUser | null> {
  if (!cookieValue) return null;

  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return null;

  const encoded = cookieValue.slice(0, dot);
  const signature = cookieValue.slice(dot + 1);

  let json: string;
  try {
    json = decodeURIComponent(encoded);
  } catch {
    return null;
  }

  const expected = await hmacHex(json);
  if (signature.length !== expected.length) return null;

  let diff = 0;
  for (let i = 0; i < signature.length; i++) {
    diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return null;

  return parseDevSession(encoded);
}

/**
 * Gets the dev user from the request cookies.
 * Returns null unless AUTH_MODE=dev, so a dev cookie can never authenticate
 * against a production deployment.
 */
export async function getDevUserFromRequest(request: Request): Promise<DevUser | null> {
  if (process.env.AUTH_MODE !== "dev") return null;

  const cookieHeader = request.headers.get("cookie") || "";
  const setCookie = cookieHeader.split(";").find((c) => c.includes(DEV_COOKIE_NAME));
  if (!setCookie) return null;

  const value = setCookie.replace(`${DEV_COOKIE_NAME}=`, "").trim();
  return verifyDevSession(value);
}

/**
 * Sets a signed dev session cookie on response headers.
 */
export async function setDevSessionCookie(
  responseHeaders: Headers,
  session: DevSession
): Promise<void> {
  const signed = await signDevSession(session);
  responseHeaders.set(
    "set-cookie",
    `${DEV_COOKIE_NAME}=${signed}; path=/; samesite=lax; secure=false; httpOnly=true`
  );
}

/**
 * Clears the dev session cookie from response headers.
 */
export function clearDevSessionCookie(responseHeaders: Headers): void {
  responseHeaders.set(
    "set-cookie",
    `${DEV_COOKIE_NAME}=; path=/; samesite=lax; secure=false; httpOnly=true`
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
  const user = await verifyDevSession(value);

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
  const existing = await getDevUserFromRequest(request);
  if (existing) return existing;

  // Create a default session for the user
  const session = createDevSession();
  return session.user;
}
