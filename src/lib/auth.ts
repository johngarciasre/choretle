/**
 * Shared Auth Verification for API Routes
 *
 * Works in both production (middleware headers) and dev mode / Turbopack
 * (cookie fallback). Turbopack doesn't run Next.js middleware, so routes
 * must self-authenticate to work locally.
 */

import { NextRequest } from "next/server";
import { parseDevSession } from "./dev-auth";
import { getRawDb } from "@/db/drizzle";

export interface AuthResult {
  userId: string;
  familyId: string;
  role?: string;
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
/**
 * Extracts just the userId from a request (without requiring familyId).
 * Used by routes that need to authenticate a user who may not yet have a family.
 */
export function extractUserId(request: NextRequest): string | null {
  // Middleware headers — works in production AND dev when middleware runs
  const userId = request.headers.get("x-user-id");
  if (userId) return userId;

  // Cookie fallback — needed when Turbopack doesn't run middleware
  const cookieHeader = request.headers.get("cookie") || "";
  const setCookie = cookieHeader.split(";").find((c) => c.includes("dev-session"));

  if (setCookie) {
    const value = setCookie.replace("dev-session=", "").trim();
    const user = parseDevSession(value);
    if (user) {
      return user.id;
    }
  }

  return null;
}

export async function verifyAuth(request: NextRequest): Promise<AuthResult | null> {
  // Middleware headers — works in production AND dev when middleware runs
  const userId = request.headers.get("x-user-id");
  const familyId = request.headers.get("x-family-id");

  if (userId && familyId) {
    return { userId, familyId };
  }

  // Cookie fallback — needed when Turbopack doesn't run middleware.
  // Query the DB for fresh role/family_id instead of trusting stale cookie values.
  const cookieHeader = request.headers.get("cookie") || "";
  const setCookie = cookieHeader.split(";").find((c) => c.includes("dev-session"));

  if (setCookie) {
    const value = setCookie.replace("dev-session=", "").trim();
    const user = parseDevSession(value);
    if (user) {
      const rawDb = getRawDb();
      if (rawDb) {
        const dbUser = rawDb.prepare(`SELECT id, family_id, role FROM users WHERE id = ?`).get(user.id) as any;
        if (dbUser?.family_id) {
          return { userId: dbUser.id, familyId: dbUser.family_id, role: dbUser.role };
        }
      }
      // Fallback to cookie values if DB not available
      if (user.familyId) {
        return { userId: user.id, familyId: user.familyId };
      }
    }
  }

  return null;
}
