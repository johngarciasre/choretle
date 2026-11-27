import { NextRequest, NextResponse } from "next/server";
import { canAuthor, verifyAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { randomBytes } from "node:crypto";

/** Parent of the *receiving* household approves; either side may revoke. */
async function loadLink(linkId: string) {
  return (await getDb()
    .prepare(
      `select id, household_id, linked_household_id, status, requested_by from household_links where id = ?`,
    )
    .get(linkId)) as
    | {
        id: string;
        household_id: string;
        linked_household_id: string;
        status: string;
        requested_by: string;
      }
    | undefined;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> },
) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!canAuthor(auth)) return NextResponse.json({ error: "Parent access required" }, { status: 403 });

    const link = await loadLink((await params).linkId);
    if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 });
    // Only the household that was asked can approve.
    if (link.linked_household_id !== auth.householdId) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }
    if (link.status !== "pending") {
      return NextResponse.json({ error: `Link is ${link.status}` }, { status: 400 });
    }

    await getDb()
      .prepare(`update household_links set status = 'active', approved_by = ?, updated_at = ? where id = ?`)
      .run(auth.userId, new Date().toISOString(), link.id);

    return NextResponse.json({ ok: true, status: "active" });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Link approve failed");
    return NextResponse.json({ error: "Could not approve the link" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> },
) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!canAuthor(auth)) return NextResponse.json({ error: "Parent access required" }, { status: 403 });

    const link = await loadLink((await params).linkId);
    if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 });
    if (link.household_id !== auth.householdId && link.linked_household_id !== auth.householdId) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    await getDb()
      .prepare(`update household_links set status = 'revoked', updated_at = ? where id = ?`)
      .run(new Date().toISOString(), link.id);

    return NextResponse.json({ ok: true, status: "revoked" });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Link revoke failed");
    return NextResponse.json({ error: "Could not revoke the link" }, { status: 500 });
  }
}
