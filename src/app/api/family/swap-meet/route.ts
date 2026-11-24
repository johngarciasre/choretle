import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

/** Swap meet entries this family shared or requested. */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const familyId = auth.familyId;
    if (!familyId) return NextResponse.json({ error: "Family ID required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const rows = rawDb.prepare(
      `SELECT * FROM swap_meet
       WHERE sharing_family_id = ? OR requesting_family_id = ?
       ORDER BY created_at DESC`
    ).all(familyId, familyId) as any[];

    return NextResponse.json({
      swaps: (rows || []).map((r: any) => ({
        id: r.id,
        slateId: r.slate_id,
        sharingFamilyId: r.sharing_family_id,
        requestedBy: r.requesting_family_id,
        status: r.status,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Family swap meet GET failed");
    return NextResponse.json({ error: "Failed to fetch swap meet entries" }, { status: 500 });
  }
}
