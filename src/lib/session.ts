/**
 * Server-side sessions for PIN identities and enrolled tablets.
 *
 * A session is a row, not a signed cookie, because a parent must be able to
 * revoke one tablet without logging out the whole product. Only the SHA-256 of
 * the token is stored.
 *
 * Idle rules (spec §7): a shared-tablet kid/tablet adult session dies after
 * 5 minutes without real activity and is hard-capped at 4 hours; a session on
 * the child's own device slides for 90 days; a picker tablet lasts 180 days.
 */

import { createHash, randomBytes } from "node:crypto";
import { getDb } from "@/db";

export const SHARED_IDLE_MS = 5 * 60 * 1000;
export const SHARED_ABSOLUTE_MS = 4 * 60 * 60 * 1000;
export const OWN_DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const PICKER_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const TOUCH_THROTTLE_MS = 30 * 1000;

export type SessionKind = "kid" | "tablet_adult" | "picker";
export type SessionMode = "own" | "shared";

export interface ResolvedSession {
  id: string;
  kind: SessionKind;
  householdId: string;
  membershipId: string;
  mode: SessionMode;
}

interface SessionRow {
  id: string;
  kind: SessionKind;
  household_id: string;
  membership_id: string | null;
  mode: SessionMode;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export function cookieName(base: string): string {
  return process.env.NODE_ENV === "production" ? `__Host-${base}` : base;
}

/**
 * `__Host-` requires `Secure`, which browsers only accept on https and on
 * http://localhost. Development over a LAN IP would break, so the prefix is
 * production-only.
 */
export function sessionCookieNames() {
  return {
    kid: cookieName("cs-kid"),
    tablet: cookieName("cs-tablet"),
    device: cookieName("cs-device"),
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export interface CreatedSession {
  token: string;
  sessionId: string;
  maxAgeSeconds: number;
}

export async function createSession(options: {
  kind: SessionKind;
  householdId: string;
  membershipId?: string | null;
  mode?: SessionMode;
  deviceLabel?: string | null;
  ttlMs: number;
}): Promise<CreatedSession> {
  const db = getDb();
  const token = randomBytes(32).toString("base64url");
  const id = `sess-${randomBytes(12).toString("hex")}`;
  const now = Date.now();
  const expiresAt = new Date(now + options.ttlMs).toISOString();
  const nowIso = new Date(now).toISOString();

  await db
    .prepare(
      `insert into sessions
         (id, kind, membership_id, household_id, mode, token_hash, device_label, created_at, last_seen_at, expires_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      options.kind,
      options.membershipId ?? null,
      options.householdId,
      options.mode ?? "own",
      hashToken(token),
      options.deviceLabel ?? null,
      nowIso,
      nowIso,
      expiresAt,
    );

  return { token, sessionId: id, maxAgeSeconds: Math.floor(options.ttlMs / 1000) };
}

/**
 * Resolve a cookie token. Returns null when the row is missing, revoked, or
 * expired. A shared session is slid forward on activity, at most once per 30 s,
 * and never past its 4-hour absolute cap.
 */
export async function resolveSessionToken(token: string | undefined | null): Promise<ResolvedSession | null> {
  if (!token) return null;
  const db = getDb();
  const row = (await db
    .prepare(
      `select id, kind, household_id, membership_id, mode, created_at, last_seen_at, expires_at, revoked_at
         from sessions where token_hash = ?`,
    )
    .get(hashToken(token))) as SessionRow | undefined;

  if (!row || row.revoked_at) return null;

  const now = Date.now();
  const expires = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expires) || expires <= now) return null;

  if (row.mode === "shared") {
    const lastSeen = new Date(row.last_seen_at).getTime();
    const created = new Date(row.created_at).getTime();
    if (now - lastSeen > TOUCH_THROTTLE_MS) {
      const nextExpiry = Math.min(now + SHARED_IDLE_MS, created + SHARED_ABSOLUTE_MS);
      await db
        .prepare(`update sessions set last_seen_at = ?, expires_at = ? where id = ?`)
        .run(new Date(now).toISOString(), new Date(nextExpiry).toISOString(), row.id);
    }
  }

  return {
    id: row.id,
    kind: row.kind,
    householdId: row.household_id,
    membershipId: row.membership_id ?? "",
    mode: row.mode,
  };
}

/** Explicit activity ping: slides a shared session without waiting for a request. */
export async function touchSession(id: string): Promise<void> {
  const db = getDb();
  const row = (await db
    .prepare(`select created_at, mode from sessions where id = ?`)
    .get(id)) as { created_at: string; mode: SessionMode } | undefined;
  if (!row || row.mode !== "shared") return;
  const now = Date.now();
  const nextExpiry = Math.min(now + SHARED_IDLE_MS, new Date(row.created_at).getTime() + SHARED_ABSOLUTE_MS);
  await db
    .prepare(`update sessions set last_seen_at = ?, expires_at = ? where id = ?`)
    .run(new Date(now).toISOString(), new Date(nextExpiry).toISOString(), id);
}

export async function revokeSession(id: string, householdId?: string): Promise<number> {
  const db = getDb();
  const result = householdId
    ? await db
        .prepare(`update sessions set revoked_at = now() where id = ? and household_id = ? and revoked_at is null`)
        .run(id, householdId)
    : await db.prepare(`update sessions set revoked_at = now() where id = ? and revoked_at is null`).run(id);
  return result.rowCount;
}

export async function revokeAllForMembership(membershipId: string): Promise<void> {
  await getDb()
    .prepare(`update sessions set revoked_at = now() where membership_id = ? and revoked_at is null`)
    .run(membershipId);
}
