import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { suspendTenant } from "@/db/tenant";
import { error } from "@/lib/logger.server";
import { noCache } from "@/lib/http";
import { clientKey, tooManyAttempts } from "@/lib/rate-limit";
import { hashToken } from "@/lib/session";
import { randomBytes } from "node:crypto";

const TTL_MS = 10 * 60 * 1000;

/**
 * Public: a device that cannot be typed into asks for a pairing code. Nothing
 * is authorized yet — a signed-in phone has to approve it (see ./approve).
 */
async function POST(request: NextRequest) {
  try {
    const attemptKey = clientKey(request, "enroll-pair");
    if (tooManyAttempts(attemptKey, { max: 20 })) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const code = randomBytes(20).toString("base64url");
    const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

    await suspendTenant(() =>
      getDb()
        .prepare(`insert into device_pairing_requests (id, code_hash, expires_at) values (?, ?, ?)`)
        .run(`pair-${randomBytes(8).toString("hex")}`, hashToken(code), expiresAt),
    );

    // No link is returned: the device builds it from its own origin, which is
    // the address the phone will be able to reach too.
    return noCache(NextResponse.json({ code, expiresAt }));
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Pairing request failed");
    return NextResponse.json({ error: "Could not start pairing" }, { status: 500 });
  }
}

const POST_impl = withTenant(POST);
export { POST_impl as POST };
