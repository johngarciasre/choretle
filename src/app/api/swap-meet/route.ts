import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error, warn } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

async function verifyLocalAuth(request: NextRequest): Promise<{ userId: string; familyId?: string } | { error: string }> {
  const auth = await verifyAuth(request);
  if (!auth) return { error: "No token provided" };
  const rawDb = getRawDb();
  if (!rawDb) return { error: "Database not initialized" };
  try {
    const user = rawDb.prepare(`SELECT id, family_id FROM users WHERE id = ?`).get(auth.userId);
    if (!user) return { error: "User not found" };
    return { userId: auth.userId, familyId: (auth.familyId || (user as any).family_id || undefined) };
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Token verification failed");
    return { error: "Invalid token" };
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const familyId = url.searchParams.get("familyId");
    const slateId = url.searchParams.get("slateId");
    const daysAhead = parseInt(url.searchParams.get("daysAhead") || "30", 10);
    if (!familyId) return NextResponse.json({ error: "familyId is required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const slates = rawDb.prepare(`SELECT * FROM slates WHERE family_id = ?`).all(familyId) as any[];
    if (!slates || slates.length === 0) return NextResponse.json({ assignments: [] });

    const schedule: any[] = [];
    const today = new Date();
    for (const slate of slates) {
      const rotations = rawDb.prepare(`SELECT * FROM rotations WHERE slate_id = ?`).all(slate.id) as any[];
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

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyLocalAuth(request);
    if ("error" in authResult) return NextResponse.json({ error: authResult.error }, { status: 401 });
    const { userId, familyId } = authResult;
    const body = await request.json();
    const { sharingFamilyId, requestingFamilyId, slateIds, messages } = body;

    if (!sharingFamilyId || !requestingFamilyId || !slateIds || !Array.isArray(slateIds)) {
      return NextResponse.json({ error: "sharingFamilyId, requestingFamilyId, and slateIds (array) are required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    // Verify families exist
    const sharingFamily = rawDb.prepare(`SELECT id FROM families WHERE id = ?`).get(sharingFamilyId) as any;
    if (!sharingFamily) return NextResponse.json({ error: "Sharing family not found" }, { status: 404 });
    const requestingFamily = rawDb.prepare(`SELECT id FROM families WHERE id = ?`).get(requestingFamilyId) as any;
    if (!requestingFamily) return NextResponse.json({ error: "Requesting family not found" }, { status: 404 });

    // Check user is member of sharing family
    const isMember = rawDb.prepare(`SELECT id FROM users WHERE family_id = ? AND id = ?`).get(familyId, userId);
    if (!isMember) return NextResponse.json({ error: "You are not a member of this family" }, { status: 403 });

    // Check for existing swap meet entries
    const existingSwap = rawDb.prepare(
      `SELECT id FROM swap_meet WHERE sharing_family_id = ? AND requesting_family_id = ?`
    ).get(sharingFamilyId, requestingFamilyId) as any;

    const createdEntries: any[] = [];
    for (const slateId of slateIds) {
      if (existingSwap && !messages?.[slateId]) continue;
      const swapMeetId = `sm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      rawDb.prepare(
        `INSERT INTO swap_meet (id, sharing_family_id, requesting_family_id, slate_id, message, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)`
      ).run(swapMeetId, sharingFamilyId, requestingFamilyId, slateId, messages?.[slateId] || "", new Date().toISOString());

      // Create history entry
      try {
        rawDb.prepare(
          `INSERT INTO job_history (id, job_id, action, details, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(`jh-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`, "swap", "swap_meet_request",
          `Shared slate ${slateId} with family ${requestingFamilyId}`, userId, new Date().toISOString());
      } catch (historyErr) {
        error({ err: historyErr }, "Failed to create swap meet history");
      }
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
      assignments.push({ date: dateStr, userId: rotation.userId, isCurrent: false,
        rotationId: rotation.id, order: rotation.order });
      const next = new Date(currentDate);
      next.setDate(next.getDate() + (rotation.interval_days || 7));
      currentDate = next;
      dateStr = currentDate.toISOString().split("T")[0];
    }
  }
  return assignments.sort((a: any, b: any) => a.date.localeCompare(b.date));
}
