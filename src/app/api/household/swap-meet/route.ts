import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

/** Swap meet entries this household shared or requested. */
async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const rows = await rawDb.prepare(
      `SELECT * FROM swap_meet
       WHERE sharing_household_id = ? OR requesting_household_id = ?
       ORDER BY created_at DESC`
    ).all(householdId, householdId) as any[];

    return NextResponse.json({
      swaps: (rows || []).map((r: any) => ({
        id: r.id,
        slateId: r.slate_id,
        sharingHouseholdId: r.sharing_household_id,
        requestedBy: r.requesting_household_id,
        status: r.status,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Household swap meet GET failed");
    return NextResponse.json({ error: "Failed to fetch swap meet entries" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
