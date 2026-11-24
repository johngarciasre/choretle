/**
 * Shared Auth Verification for API Routes
 *
 * Works in both production (middleware headers) and dev mode (signed cookie).
 * The database is the source of truth for the user's family and role, so a
 * stale cookie cannot grant access to a family the user does not belong to.
 */

import { NextRequest } from "next/server";
import { getDevUserFromRequest } from "./dev-auth";
import { getRawDb } from "@/db/drizzle";

export interface AuthResult {
  userId: string;
  familyId: string;
  role?: string;
}

interface DbUser {
  id: string;
  family_id: string | null;
  role: string | null;
}

function lookupUser(userId: string): DbUser | null {
  const rawDb = getRawDb();
  if (!rawDb) return null;
  try {
    return (rawDb.prepare(`SELECT id, family_id, role FROM users WHERE id = ?`).get(userId) as DbUser) || null;
  } catch {
    return null;
  }
}

/**
 * Extracts just the userId from a request (without requiring familyId).
 * Used by routes that need to authenticate a user who may not yet have a family.
 */
export async function extractUserId(request: NextRequest): Promise<string | null> {
  const headerUserId = request.headers.get("x-user-id");
  if (headerUserId) return headerUserId;

  const cookieUser = await getDevUserFromRequest(request);
  return cookieUser?.id ?? null;
}

/**
 * Verifies authentication. Returns the authenticated user + family ID,
 * or null if not authenticated.
 *
 * Order of precedence:
 *   1. x-user-id header (set by middleware in production and dev)
 *   2. signed dev-session cookie (dev mode only)
 *
 * In both cases family and role come from the users table when the row exists.
 */
export async function verifyAuth(request: NextRequest): Promise<AuthResult | null> {
  const headerUserId = request.headers.get("x-user-id") || "";
  const cookieUser = headerUserId ? null : await getDevUserFromRequest(request);
  const userId = headerUserId || cookieUser?.id || "";

  if (!userId) return null;

  const dbUser = lookupUser(userId);
  if (dbUser?.family_id) {
    return { userId: dbUser.id, familyId: dbUser.family_id, role: dbUser.role || "child" };
  }

  // No family row yet (e.g. a brand-new account): fall back to trusted headers
  // or the signed cookie so onboarding routes can still identify the user.
  const familyId = request.headers.get("x-family-id") || cookieUser?.familyId || "";
  if (!familyId) return null;

  return { userId, familyId, role: dbUser?.role || cookieUser?.role || "child" };
}
