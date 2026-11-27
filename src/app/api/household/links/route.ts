import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { canAuthor, verifyAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { noCache } from "@/lib/http";
import { randomBytes } from "node:crypto";
import { suspendTenant } from "@/db/tenant";

interface LinkRow {
  id: string;
  household_id: string;
  linked_household_id: string;
  status: string;
  requested_by: string;
  approved_by: string | null;
  created_at: string;
}

/** Both directions of this household's links, with the other side named. */
async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const links = (await suspendTenant(() =>
      getDb()
      .prepare(
        `select l.id, l.household_id, l.linked_household_id, l.status, l.requested_by, l.approved_by, l.created_at,
                h.name as other_name
           from household_links l
           join households h
             on h.id = case when l.household_id = ? then l.linked_household_id else l.household_id end
          where l.household_id = ? or l.linked_household_id = ?
          order by l.created_at desc`,
      )
      .all(auth.householdId, auth.householdId, auth.householdId),
    )) as (LinkRow & { other_name: string })[];

    return noCache(
      NextResponse.json({
        links: links.map((link) => ({
          id: link.id,
          householdId: link.household_id,
          linkedHouseholdId: link.linked_household_id,
          householdName: link.other_name,
          status: link.status,
          direction: link.household_id === auth.householdId ? "outgoing" : "incoming",
          createdAt: link.created_at,
        })),
      }),
    );
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Links GET failed");
    return NextResponse.json({ error: "Failed to list links" }, { status: 500 });
  }
}

/** Parent only: ask another household to share aggregate reports. */
async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!canAuthor(auth)) return NextResponse.json({ error: "Parent access required" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const targetId = typeof body?.householdId === "string" ? body.householdId : "";
    if (!targetId) return NextResponse.json({ error: "householdId is required" }, { status: 400 });
    if (targetId === auth.householdId) {
      return NextResponse.json({ error: "A household cannot link to itself" }, { status: 400 });
    }

    const db = getDb();
    // The household being invited is outside this tenant by definition.
    const target = await suspendTenant(() =>
      db.prepare(`select id from households where id = ?`).get(targetId),
    );
    if (!target) return NextResponse.json({ error: "Household not found" }, { status: 404 });

    const existing = (await db
      .prepare(
        `select id, status from household_links
          where (household_id = ? and linked_household_id = ?)
             or (household_id = ? and linked_household_id = ?)`,
      )
      .get(auth.householdId, targetId, targetId, auth.householdId)) as { id: string; status: string } | undefined;
    if (existing && existing.status !== "revoked") {
      return NextResponse.json({ error: "A link already exists" }, { status: 409 });
    }

    const id = `link-${randomBytes(8).toString("hex")}`;
    await db
      .prepare(
        `insert into household_links (id, household_id, linked_household_id, requested_by, status)
         values (?, ?, ?, ?, 'pending')`,
      )
      .run(id, auth.householdId, targetId, auth.userId);

    return NextResponse.json({ ok: true, id, status: "pending" });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Link POST failed");
    return NextResponse.json({ error: "Could not request a link" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
const POST_impl = withTenant(POST);
export { POST_impl as POST };
