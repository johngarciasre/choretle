import { NextRequest, NextResponse } from "next/server";
import { canAuthor, verifyAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { isValidPin, verifyPin } from "@/lib/pin";
import { hashPin } from "@/lib/pin";
import { getMembershipFor } from "@/lib/membership";
import { revokeAllForMembership } from "@/lib/session";

/**
 * Set or reset a PIN.
 *
 * A parent resets anyone in their household; a person may change their own PIN
 * after proving the current one. Old PIN sessions are revoked on every change so
 * a forgotten tablet cannot keep working with the previous code.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const targetUserId = (await params).userId;
    const body = await request.json().catch(() => ({}));
    const pin = body?.pin;
    if (!isValidPin(pin)) {
      return NextResponse.json({ error: "A PIN is 4 emoji from the grid" }, { status: 400 });
    }

    const membership = await getMembershipFor(targetUserId, auth.householdId);
    if (!membership) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    const isSelf = targetUserId === auth.userId;
    if (!canAuthor(auth) && !isSelf) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const db = getDb();
    if (isSelf && auth.kind === "adult") {
      const row = (await db.prepare(`select pin_hash from users where id = ?`).get(targetUserId)) as
        | { pin_hash: string | null }
        | undefined;
      // Setting the first PIN on your own account needs no proof; changing one does.
      if (row?.pin_hash && !verifyPin(body?.currentPin ?? [], row.pin_hash)) {
        return NextResponse.json({ error: "That is not the current PIN" }, { status: 403 });
      }
    }

    await db
      .prepare(`update users set pin_hash = ?, pin_set_at = ?, updated_at = ? where id = ?`)
      .run(hashPin(pin), new Date().toISOString(), new Date().toISOString(), targetUserId);

    await revokeAllForMembership(membership.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "PIN set failed");
    return NextResponse.json({ error: "Could not set that PIN" }, { status: 500 });
  }
}
