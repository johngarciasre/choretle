import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { getMembershipFor } from "@/lib/membership";
import { error } from "@/lib/logger.server";
import { noCache } from "@/lib/http";
import {
  OWN_DEVICE_TTL_MS,
  PICKER_TTL_MS,
  cookieOptions,
  createSession,
  hashToken,
  sessionCookieNames,
} from "@/lib/session";

/**
 * Public, code-gated. Consumes a single-use enrolment code and creates either a
 * kid session (own device) or a picker session (shared tablet).
 */
async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code) return NextResponse.json({ error: "A code is required" }, { status: 400 });

    const db = getDb();
    const row = (await db
      .prepare(
        `select id, household_id, user_id, expires_at, used_at
           from device_enrollments where code_hash = ?`,
      )
      .get(hashToken(code))) as
      | { id: string; household_id: string; user_id: string | null; expires_at: string; used_at: string | null }
      | undefined;

    if (!row) return NextResponse.json({ error: "That code is not valid" }, { status: 400 });
    if (row.used_at) return NextResponse.json({ error: "That code has already been used" }, { status: 400 });
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "That code has expired" }, { status: 400 });
    }

    const label = typeof body?.label === "string" ? body.label.slice(0, 120) : null;

    let kind: "kid" | "picker";
    let token: string;
    let maxAgeSeconds: number;

    if (row.user_id) {
      const membership = await getMembershipFor(row.user_id, row.household_id);
      if (!membership) return NextResponse.json({ error: "That profile is gone" }, { status: 400 });
      const session = await createSession({
        kind: "kid",
        householdId: row.household_id,
        membershipId: membership.id,
        mode: "own",
        deviceLabel: label,
        ttlMs: OWN_DEVICE_TTL_MS,
      });
      kind = "kid";
      token = session.token;
      maxAgeSeconds = session.maxAgeSeconds;
    } else {
      const session = await createSession({
        kind: "picker",
        householdId: row.household_id,
        mode: "own",
        deviceLabel: label,
        ttlMs: PICKER_TTL_MS,
      });
      kind = "picker";
      token = session.token;
      maxAgeSeconds = session.maxAgeSeconds;
    }

    // Single use: the code dies even if the response never arrives.
    await db.prepare(`update device_enrollments set used_at = ? where id = ?`).run(new Date().toISOString(), row.id);

    const names = sessionCookieNames();
    const response = noCache(NextResponse.json({ ok: true, kind }));
    response.cookies.set(kind === "kid" ? names.kid : names.device, token, cookieOptions(maxAgeSeconds));
    return response;
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Enrolment consume failed");
    return NextResponse.json({ error: "Could not finish enrolment" }, { status: 500 });
  }
}

const POST_impl = withTenant(POST);
export { POST_impl as POST };
