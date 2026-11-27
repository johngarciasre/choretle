import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { getMembershipFor } from "@/lib/membership";
import { error } from "@/lib/logger.server";
import { noCache } from "@/lib/http";
import { suspendTenant } from "@/db/tenant";

const COOKIE = "ch-household";

/**
 * Pick which household the current session acts in.
 *
 * Only a household where the person actually holds a membership is accepted, so
 * the cookie can never widen access — `verifyAuth` re-checks it on every request
 * and falls back to the person's own membership when it does not match.
 */
async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (auth.kind !== "adult") {
      return NextResponse.json({ error: "A PIN session stays in its own household" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const householdId = typeof body?.householdId === "string" ? body.householdId : "";
    if (!householdId) return NextResponse.json({ error: "householdId is required" }, { status: 400 });

    // The target household is outside the current tenant by definition.
    const membership = await suspendTenant(() => getMembershipFor(auth.userId, householdId));
    if (!membership) return NextResponse.json({ error: "Not a member of that household" }, { status: 403 });

    const response = noCache(
      NextResponse.json({ ok: true, householdId: membership.householdId, role: membership.role }),
    );
    response.cookies.set(COOKIE, membership.householdId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Household switch failed");
    return NextResponse.json({ error: "Could not switch household" }, { status: 500 });
  }
}

/** Forget the choice, falling back to the person's first membership. */
async function DELETE() {
  const response = noCache(NextResponse.json({ ok: true }));
  response.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}

const POST_impl = withTenant(POST);
export { POST_impl as POST };
const DELETE_impl = withTenant(DELETE);
export { DELETE_impl as DELETE };
