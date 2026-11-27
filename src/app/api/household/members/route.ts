import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { canAuthor, verifyAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { isValidPin } from "@/lib/pin-emoji";
import { hashPin } from "@/lib/pin";
import { randomUUID } from "node:crypto";

/**
 * Parent only: create a person and add them to this household.
 *
 * Under-13 accounts arrive without an email (no identity row); a 13+ teen may
 * carry one and attach a Supabase login later without changing their user id.
 */
async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!canAuthor(auth)) return NextResponse.json({ error: "Parent access required" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const role = body?.role === "parent" || body?.role === "helper" ? body.role : "child";
    const email = typeof body?.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : null;
    const birthYear = Number.isInteger(body?.birthYear) ? body.birthYear : null;
    const pin = body?.pin;

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (pin !== undefined && !isValidPin(pin)) {
      return NextResponse.json({ error: "A PIN is 4 emoji from the grid" }, { status: 400 });
    }
    // Children under 13 never carry an email address.
    if (email && birthYear && new Date().getUTCFullYear() - birthYear < 13) {
      return NextResponse.json({ error: "Children under 13 sign in with a PIN, not an email" }, { status: 400 });
    }

    const db = getDb();
    const userId = `user-${randomUUID()}`;
    const now = new Date().toISOString();

    await db
      .prepare(
        `insert into users (id, email, name, avatar_url, birth_year, pin_hash, pin_set_at, created_at, updated_at)
         values (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      )
      .run(userId, email, name, birthYear, pin !== undefined ? hashPin(pin) : null, pin !== undefined ? now : null, now, now);

    await db
      .prepare(
        `insert into memberships (id, household_id, user_id, role, points_total, joined_at)
         values (?, ?, ?, ?, 0, ?)`,
      )
      .run(`mem-${randomUUID()}`, auth.householdId, userId, role, now);

    return NextResponse.json(
      {
        ok: true,
        user: { id: userId, name, email, role, avatarUrl: null, pointsTotal: 0 },
        hasPin: pin !== undefined,
      },
      { status: 201 },
    );
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Member create failed");
    return NextResponse.json({ error: "Could not add that member" }, { status: 500 });
  }
}

const POST_impl = withTenant(POST);
export { POST_impl as POST };
