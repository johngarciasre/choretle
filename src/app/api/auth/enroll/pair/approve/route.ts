import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { canAuthor, verifyAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { suspendTenant } from "@/db/tenant";
import { error } from "@/lib/logger.server";
import { noCache } from "@/lib/http";
import { hashToken } from "@/lib/session";
import { randomBytes } from "node:crypto";

const TTL_MS = 5 * 60 * 1000;

/**
 * Parent only: approve the device that showed this code. Approval mints a
 * normal single-use enrollment code, which the waiting device then consumes
 * through /api/auth/enroll/consume — so a paired tablet is exactly the same
 * thing as a typed-in one.
 */
async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!canAuthor(auth)) return NextResponse.json({ error: "Parent access required" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code) return NextResponse.json({ error: "A code is required" }, { status: 400 });

    const codeHash = hashToken(code);

    // The pairing row is pre-tenant, so it is only reachable as the owner.
    const pairing = (await suspendTenant(() =>
      getDb()
        .prepare(`select id, expires_at, approved_at from device_pairing_requests where code_hash = ?`)
        .get(codeHash),
    )) as { id: string; expires_at: string; approved_at: string | null } | undefined;

    if (!pairing) return NextResponse.json({ error: "That code is not valid" }, { status: 404 });
    if (pairing.approved_at) {
      return NextResponse.json({ error: "That tablet has already been approved" }, { status: 409 });
    }
    if (new Date(pairing.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "That code has expired. Refresh the tablet." }, { status: 410 });
    }

    const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
    const enrollmentId = `enroll-${randomBytes(8).toString("hex")}`;

    // Tenant scope again for the enrollment row itself, so RLS checks that the
    // approving parent really belongs to this household.
    await getDb()
      .prepare(
        `insert into device_enrollments (id, household_id, user_id, code_hash, created_by, expires_at)
         values (?, ?, ?, ?, ?, ?)`,
      )
      .run(enrollmentId, auth.householdId, null, codeHash, auth.userId, expiresAt);

    await suspendTenant(() =>
      getDb()
        .prepare(`update device_pairing_requests set approved_at = ?, household_id = ?, approved_by = ? where id = ?`)
        .run(new Date().toISOString(), auth.householdId, auth.userId, pairing.id),
    );

    return noCache(NextResponse.json({ ok: true, householdId: auth.householdId }));
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Pairing approval failed");
    return NextResponse.json({ error: "Could not approve that tablet" }, { status: 500 });
  }
}

const POST_impl = withTenant(POST);
export { POST_impl as POST };
