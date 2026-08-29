/**
 * Shared Auth Verification for API Routes
 *
 * Works in both production (middleware headers) and dev mode / Turbopack
 * (cookie fallback). Turbopack doesn't run Next.js middleware, so routes
 * must self-authenticate to work locally.
 */

import { NextRequest } from "next/server";
import { parseDevSession } from "./dev-auth";

export interface AuthResult {
  userId: string;
  familyId: string;
}

/**
 * Verifies authentication by checking middleware headers first, then falling
 * back to dev-session cookie. Returns the authenticated user + family ID,
 * or null if not authenticated.
 *
 * Order of precedence:
 *   1. x-user-id / x-family-id headers (set by middleware in production)
 *   2. dev-session cookie (set by signin route in dev mode)
 */
export function verifyAuth(request: NextRequest): AuthResult | null {
  // Middleware headers — works in production AND dev when middleware runs
  const userId = request.headers.get("x-user-id");
  const familyId = request.headers.get("x-family-id");

  if (userId && familyId) {
    return { userId, familyId };
  }

  // Cookie fallback — needed when Turbopack doesn't run middleware
  const cookieHeader = request.headers.get("cookie") || "";
  const setCookie = cookieHeader.split(";").find((c) => c.includes("dev-session"));

  if (setCookie) {
    const value = setCookie.replace("dev-session=", "").trim();
    const user = parseDevSession(value);
    if (user && user.familyId) {
      return { userId: user.id, familyId: user.familyId };
    }
  }

  return null;
}
