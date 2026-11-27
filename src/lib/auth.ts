/**
 * Shared auth verification for API routes.
 *
 * Three credentials are accepted, in this order:
 *   1. `x-user-id` — set by middleware from a Supabase session (or dev cookie)
 *   2. a signed dev-session cookie, only when AUTH_MODE=dev
 *   3. `cs-kid` / `cs-tablet` — a server-side session row (PIN sign-in)
 *
 * Every branch resolves through `memberships`, so the household and role in an
 * AuthResult can never come from a client-supplied header or query param.
 * Picker sessions are deliberately NOT accepted here: they only resolve through
 * `verifyPicker`, which is why a shared tablet cannot read chores.
 */

import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { getDevUserFromRequest } from "./dev-auth";
import { getMembership, type Role } from "./membership";
import { resolveSessionToken, sessionCookieNames } from "./session";
import { cacheGet } from "@/db/tenant";

export type SessionKind = "adult" | "tablet_adult" | "kid";

export interface AuthResult {
  userId: string;
  householdId: string;
  membershipId: string;
  role: Role;
  kind: SessionKind;
  sessionId?: string;
}

export interface PickerResult {
  sessionId: string;
  householdId: string;
}

/** Extracts just the userId from a request (without requiring a household). */
export async function extractUserId(request: NextRequest): Promise<string | null> {
  const headerUserId = request.headers.get("x-user-id");
  if (headerUserId) return headerUserId;

  const cookieUser = await getDevUserFromRequest(request);
  return cookieUser?.id ?? null;
}

export async function verifyAuth(request: NextRequest): Promise<AuthResult | null> {
  // Resolved once per request by withTenant(); reuse it inside the RLS scope.
  const cachedAuth = cacheGet<AuthResult>("auth");
  if (cachedAuth) return cachedAuth;

  // 1. Middleware-resolved identity (Supabase in production, dev cookie in dev).
  const headerUserId = request.headers.get("x-user-id") || "";
  const cookieUser = headerUserId ? null : await getDevUserFromRequest(request);
  const userId = headerUserId || cookieUser?.id || "";

  if (userId) {
    const canonicalId = await canonicalUserId(userId);
    const preferred = request.headers.get("x-household-id") || null;
    const membership = await getMembership(canonicalId, preferred);
    if (membership) {
      return {
        userId: canonicalId,
        householdId: membership.householdId,
        membershipId: membership.id,
        role: membership.role,
        kind: "adult",
      };
    }
    // No membership yet (a brand-new account mid-signup): only a signed dev
    // cookie may name a household. Request headers are never trusted for that.
    if (cookieUser?.householdId) {
      return {
        userId: canonicalId,
        householdId: cookieUser.householdId,
        membershipId: "",
        role: (cookieUser.role as Role) || "child",
        kind: "adult",
      };
    }
    return null;
  }

  // 2. PIN sessions: a shared tablet (kid or tablet adult) or an enrolled device.
  const names = sessionCookieNames();
  for (const [cookie, kind] of [
    [names.kid, "kid"],
    [names.tablet, "tablet_adult"],
  ] as const) {
    const session = await resolveSessionToken(request.cookies.get(cookie)?.value);
    if (!session) continue;
    if (session.kind !== kind) continue;
    const membership = await getMembershipForSession(session);
    if (!membership) return null;
    return {
      userId: membership.userId,
      householdId: membership.householdId,
      membershipId: membership.id,
      role: membership.role,
      kind,
      sessionId: session.id,
    };
  }

  return null;
}

async function getMembershipForSession(session: { membershipId: string; householdId: string }) {
  const { getMembershipById } = await import("./membership");
  return getMembershipById(session.membershipId, session.householdId);
}

/**
 * A Supabase user id is not our user id: `auth_identities` links the two so a
 * child's points and history survive the day they attach an email login.
 */
async function canonicalUserId(id: string): Promise<string> {
  try {
    const row = (await getDb()
      .prepare(`select user_id from auth_identities where provider_uid = ?`)
      .get(id)) as { user_id: string } | undefined;
    return row?.user_id ?? id;
  } catch {
    return id;
  }
}

/**
 * Picker sessions resolve here and nowhere else. They carry no user and grant
 * only: list profiles, exchange a PIN, read the kiosk payload.
 */
export async function verifyPicker(request: NextRequest): Promise<PickerResult | null> {
  const cachedPicker = cacheGet<PickerResult>("picker");
  if (cachedPicker) return cachedPicker;

  const session = await resolveSessionToken(request.cookies.get(sessionCookieNames().device)?.value);
  if (!session || session.kind !== "picker") return null;
  return { sessionId: session.id, householdId: session.householdId };
}

/** A PIN session is kid-level regardless of the person's role. */
export function isRestrictedSession(auth: AuthResult | null): boolean {
  return auth?.kind === "kid" || auth?.kind === "tablet_adult";
}

/** Parent-only authoring. PIN sessions never qualify, even for a parent. */
export function canAuthor(auth: AuthResult | null): boolean {
  return !!auth && auth.kind === "adult" && auth.role === "parent";
}

/** Approve or return a submitted chore: parents and helpers, adult session only. */
export function canApprove(auth: AuthResult | null): boolean {
  return !!auth && auth.kind === "adult" && (auth.role === "parent" || auth.role === "helper");
}
