import { NextRequest, NextResponse } from "next/server";
import { canAuthor, verifyAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { getMembershipFor } from "@/lib/membership";
import { error } from "@/lib/logger.server";
import { noCache } from "@/lib/http";
import { hashToken } from "@/lib/session";
import { randomBytes } from "node:crypto";

const TTL_MS = 5 * 60 * 1000;

/**
 * Parent only: mint a single-use enrolment code. Omit `userId` to enrol a
 * shared tablet (picker); pass one to enrol that person's own device.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!canAuthor(auth)) return NextResponse.json({ error: "Parent access required" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" && body.userId ? body.userId : null;
    if (userId) {
      const membership = await getMembershipFor(userId, auth.householdId);
      if (!membership) return NextResponse.json({ error: "Not a member of this household" }, { status: 403 });
    }

    const code = randomBytes(20).toString("base64url");
    const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

    await getDb()
      .prepare(
        `insert into device_enrollments (id, household_id, user_id, code_hash, created_by, expires_at)
         values (?, ?, ?, ?, ?, ?)`,
      )
      .run(`enroll-${randomBytes(8).toString("hex")}`, auth.householdId, userId, hashToken(code), auth.userId, expiresAt);

    const origin = new URL(request.url).origin;
    return noCache(
      NextResponse.json({
        code,
        expiresAt,
        // Fragment, not query: it never reaches a proxy or a Referer header.
        qrPayload: `${origin}/enroll#${code}`,
        label: body?.label ?? null,
      }),
    );
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Enrolment mint failed");
    return NextResponse.json({ error: "Could not create a code" }, { status: 500 });
  }
}
