import { NextRequest, NextResponse } from "next/server";
import { verifyPicker } from "@/lib/auth";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { noCache } from "@/lib/http";
import { clearAttempts, tooManyAttempts } from "@/lib/rate-limit";
import { isValidPin, verifyPin } from "@/lib/pin";
import {
  SHARED_ABSOLUTE_MS,
  SHARED_IDLE_MS,
  cookieOptions,
  createSession,
  sessionCookieNames,
} from "@/lib/session";

/**
 * Exchange a PIN for a session, from a picker tablet only.
 *
 * The credential decides the session kind: a parent signing in with a PIN gets
 * `tablet_adult`, which carries the same kid-level rights as a child session.
 */
export async function POST(request: NextRequest) {
  try {
    const picker = await verifyPicker(request);
    if (!picker) return NextResponse.json({ error: "Tablet not enrolled" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" ? body.userId : "";
    const pin = body?.pin;

    if (!userId || !isValidPin(pin)) {
      return NextResponse.json({ error: "userId and a 4-emoji pin are required" }, { status: 400 });
    }

    const limitKey = `pin:${userId}`;
    if (tooManyAttempts(limitKey, { max: 5 })) {
      return NextResponse.json({ error: "Too many tries. Ask a grown-up for help." }, { status: 429 });
    }

    const db = getDb();
    const row = (await db
      .prepare(
        `select m.id as membership_id, m.role, u.id, u.name, u.pin_hash
           from memberships m
           join users u on u.id = m.user_id
          where m.household_id = ? and u.id = ?`,
      )
      .get(picker.householdId, userId)) as
      | { membership_id: string; role: string; id: string; name: string; pin_hash: string | null }
      | undefined;

    if (!row) return NextResponse.json({ error: "That profile is not in this household" }, { status: 403 });
    if (!verifyPin(pin, row.pin_hash)) {
      return NextResponse.json({ error: "That is not the right picture code" }, { status: 401 });
    }
    clearAttempts(limitKey);

    const kind = row.role === "child" ? "kid" : "tablet_adult";
    const session = await createSession({
      kind,
      householdId: picker.householdId,
      membershipId: row.membership_id,
      mode: "shared",
      deviceLabel: request.headers.get("user-agent")?.slice(0, 120) ?? null,
      // The row expires after five idle minutes; the cookie may live longer
      // because activity is what keeps the session alive.
      ttlMs: SHARED_IDLE_MS,
    });

    const names = sessionCookieNames();
    const response = noCache(
      NextResponse.json({
        ok: true,
        user: { id: row.id, name: row.name },
        kind,
        idleTimeoutSeconds: 300,
      }),
    );
    response.cookies.set(
      kind === "kid" ? names.kid : names.tablet,
      session.token,
      cookieOptions(Math.floor(SHARED_ABSOLUTE_MS / 1000)),
    );
    return response;
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Kid sign-in failed");
    return NextResponse.json({ error: "Could not sign in" }, { status: 500 });
  }
}
