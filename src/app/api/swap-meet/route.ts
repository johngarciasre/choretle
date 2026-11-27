import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";
import { suspendTenant } from "@/db/tenant";

async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const url = new URL(request.url);
    const daysAhead = parseInt(url.searchParams.get("daysAhead") || "30", 10);

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    // Only this household's schedule — the household id comes from the session, never the query.
    const slates = await rawDb.prepare(`SELECT * FROM slates WHERE household_id = ?`).all(auth.householdId) as any[];
    if (!slates || slates.length === 0) return NextResponse.json({ assignments: [] });

    const schedule: any[] = [];
    const today = new Date();
    for (const slate of slates) {
      const rotations = await rawDb.prepare(`SELECT * FROM rotations WHERE slate_id = ?`).all(slate.id) as any[];
      if (!rotations || rotations.length === 0) continue;
      const assignments = calculateUpcomingAssignments(rotations, today, daysAhead);
      schedule.push({ slateId: slate.id, slateName: slate.name, frequency: slate.frequency,
        interval: slate.interval || 1, assignments });
    }
    schedule.sort((a: any, b: any) => b.assignments.length - a.assignments.length);
    return NextResponse.json({ assignments: schedule });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Failed to fetch rotation schedule");
    return NextResponse.json({ error: "Failed to fetch rotation schedule" }, { status: 500 });
  }
}

async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const body = await request.json();
    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    // ─── Swap two rotation entries (the "swap" control on the page) ─────
    if (body?.rotationId1 && body?.rotationId2) {
      const { slateId, rotationId1, rotationId2 } = body;
      const slate = await rawDb.prepare(`SELECT id FROM slates WHERE id = ? AND household_id = ?`).get(slateId, auth.householdId) as any;
      if (!slate) return NextResponse.json({ error: "Slate not found" }, { status: 404 });

      const first = await rawDb.prepare(`SELECT id, user_id FROM rotations WHERE id = ? AND slate_id = ?`).get(rotationId1, slateId) as any;
      const second = await rawDb.prepare(`SELECT id, user_id FROM rotations WHERE id = ? AND slate_id = ?`).get(rotationId2, slateId) as any;
      if (!first || !second) return NextResponse.json({ error: "Rotation not found" }, { status: 404 });

      await rawDb.prepare(`UPDATE rotations SET user_id = ? WHERE id = ?`).run(second.user_id, first.id);
      await rawDb.prepare(`UPDATE rotations SET user_id = ? WHERE id = ?`).run(first.user_id, second.id);

      return NextResponse.json({ success: true, message: "Rotations swapped successfully" });
    }

    // ─── Share slates with another household ───────────────────────────────
    const { sharingHouseholdId, requestingHouseholdId, slateIds, messages } = body;

    if (!sharingHouseholdId || !requestingHouseholdId || !Array.isArray(slateIds)) {
      return NextResponse.json({ error: "sharingHouseholdId, requestingHouseholdId, and slateIds (array) are required" }, { status: 400 });
    }
    if (sharingHouseholdId !== auth.householdId) {
      return NextResponse.json({ error: "You can only share your own household's slates" }, { status: 403 });
    }

    const requestingHousehold = await suspendTenant(() =>
      rawDb.prepare(`SELECT id FROM households WHERE id = ?`).get(requestingHouseholdId),
    ) as any;
    if (!requestingHousehold) return NextResponse.json({ error: "Requesting household not found" }, { status: 404 });

    const createdEntries: any[] = [];
    for (const slateId of slateIds) {
      const slate = await rawDb.prepare(`SELECT id FROM slates WHERE id = ? AND household_id = ?`).get(slateId, sharingHouseholdId) as any;
      if (!slate) return NextResponse.json({ error: `Slate ${slateId} not found in your household` }, { status: 404 });

      const swapMeetId = `sm-${crypto.randomUUID()}`;
      await rawDb.prepare(
        `INSERT INTO swap_meet (id, sharing_household_id, requesting_household_id, slate_id, message, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)`
      ).run(swapMeetId, sharingHouseholdId, requestingHouseholdId, slateId, messages?.[slateId] || null, new Date().toISOString());

      createdEntries.push({ id: swapMeetId, slateId });
    }

    return NextResponse.json({ success: true, message: "Swap meet entry created successfully", entries: createdEntries });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Swap meet POST failed");
    return NextResponse.json({ error: "Failed to create swap meet entry" }, { status: 500 });
  }
}

function calculateUpcomingAssignments(rotations: any[], startDate: Date, daysAhead: number): any[] {
  if (!rotations || rotations.length === 0) return [];
  const assignments: any[] = [];
  for (const rotation of rotations) {
    let currentDate = new Date(startDate);
    let dateStr = currentDate.toISOString().split("T")[0];
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + daysAhead);
    while (dateStr <= endDate.toISOString().split("T")[0]) {
      assignments.push({ date: dateStr, userId: rotation.user_id ?? rotation.userId, isCurrent: false,
        rotationId: rotation.id, order: rotation.order });
      const next = new Date(currentDate);
      next.setDate(next.getDate() + (rotation.interval_days || 7));
      currentDate = next;
      dateStr = currentDate.toISOString().split("T")[0];
    }
  }
  return assignments.sort((a: any, b: any) => a.date.localeCompare(b.date));
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
const POST_impl = withTenant(POST);
export { POST_impl as POST };
