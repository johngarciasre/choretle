import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { error } from "@/lib/logger.server";
import { noCache } from "@/lib/http";
import { SHARED_ABSOLUTE_MS, cookieOptions, sessionCookieNames, touchSession } from "@/lib/session";

/**
 * Activity ping. Only a real interaction on the client calls this, so an
 * abandoned tab cannot keep a shared session alive by running a timer.
 */
async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth || !auth.sessionId) {
      return NextResponse.json({ error: "No PIN session" }, { status: 401 });
    }

    await touchSession(auth.sessionId);

    const response = noCache(NextResponse.json({ ok: true, idleTimeoutSeconds: 300 }));
    const names = sessionCookieNames();
    const cookie = auth.kind === "kid" ? names.kid : names.tablet;
    const token = request.cookies.get(cookie)?.value;
    if (token) {
      response.cookies.set(cookie, token, cookieOptions(Math.floor(SHARED_ABSOLUTE_MS / 1000)));
    }
    return response;
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Session touch failed");
    return NextResponse.json({ error: "Could not refresh the session" }, { status: 500 });
  }
}

const POST_impl = withTenant(POST);
export { POST_impl as POST };
