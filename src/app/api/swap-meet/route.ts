import { NextRequest, NextResponse } from "next/server";
import { initDb, rawInsert } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and, desc, sql, or } from "drizzle-orm";
import { error, warn } from "@/lib/logger.server";

// ─── Middleware: Verify Auth Token ──────────────────────────────────
async function verifyAuth(request: NextRequest): Promise<{ userId: string; familyId?: string } | { error: string }> {
  const cookie = request.cookies.get("auth-token")?.value;
  if (!cookie) {
    return { error: "No token provided" };
  }

  try {
    const parts = cookie.split(".");
    if (parts.length !== 3) {
      return { error: "Invalid token format" };
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const now = Math.floor(Date.now() / 1000);
    
    if (payload.exp && payload.exp < now) {
      return { error: "Token expired" };
    }

    // Ensure DB is initialized to validate user exists
    const db = await initDb();
    if (!db) {
      return { error: "Database not initialized" };
    }

    const user = (await db.select().from(schema.users).where(eq(schema.users.id, payload.userId)).limit(1))[0];
    if (!user) {
      return { error: "User not found" };
    }

    return { userId: payload.userId, familyId: payload.familyId || undefined };
  } catch (error) {
    error({ err: error }, "Token verification failed");
    return { error: "Invalid token" };
  }
}

// ─── Helper Functions ───────────────────────────────────────────────
async function createDb(): Promise<any> {
  const db = await initDb();
  if (!db) throw new Error("Database not initialized");
  return db;
}

function getValidStatuses(): string[] {
  return ["pending", "accepted", "rejected"];
}

// ─── GET: Fetch rotation schedule for swap UI ────────────────────────
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const familyId = url.searchParams.get("familyId");
    const slateId = url.searchParams.get("slateId");
    const daysAhead = parseInt(url.searchParams.get("daysAhead") || "30", 10);

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required" }, { status: 400 });
    }

    const db = await createDb();

    // Fetch upcoming assignments for all slates in the family
    const assignments = await getUpcomingAssignments(db, familyId, daysAhead);

    return NextResponse.json({ assignments });
  } catch (error) {
    error({ err: error }, "Failed to fetch rotation schedule");
    if (error instanceof Error && error.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to fetch rotation schedule" }, { status: 500 });
  }
}

// ─── POST: Share Slates with Another Family (Swap Meet) ─────────────
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { userId, familyId } = authResult;
    const body = await request.json();

    const {
      sharingFamilyId,
      requestingFamilyId,
      slateIds,
      messages,
    } = body;

    // Validate required fields
    if (!sharingFamilyId || !requestingFamilyId) {
      return NextResponse.json({ error: "sharingFamilyId and requestingFamilyId are required" }, { status: 400 });
    }

    const db = await createDb();

    // Verify the sharing family exists and belongs to the authenticated user
    const sharingFamily = (await db.select().from(schema.families).where(eq(schema.families.id, sharingFamilyId)).limit(1))[0];
    if (!sharingFamily) {
      return NextResponse.json({ error: "Sharing family not found" }, { status: 404 });
    }

    // Verify requesting family exists
    const requestingFamily = (await db.select().from(schema.families).where(eq(schema.families.id, requestingFamilyId)).limit(1))[0];
    if (!requestingFamily) {
      return NextResponse.json({ error: "Requesting family not found" }, { status: 404 });
    }

    // Check that the user is part of the sharing family
    const isMember = await db.select().from(schema.users).where(
      and(eq(schema.users.id, userId), eq(schema.users.familyId, sharingFamilyId))
    ).limit(1)[0];

    if (!isMember) {
      return NextResponse.json({ error: "You are not a member of the sharing family" }, { status: 403 });
    }

    // Check for existing swap meet entry between these families (avoid duplicates)
    const existingSwap = await db.select().from(schema.swapMeet).where(
      and(
        eq(schema.swapMeet.sharingFamilyId, sharingFamilyId),
        or(eq(schema.swapMeet.requestedBy, requestingFamilyId))
      )
    ).limit(1)[0];

    if (existingSwap) {
      return NextResponse.json({ 
        error: "Swap meet request already exists between these families",
        existingEntry: { id: existingSwap.id, status: existingSwap.status }
      }, { status: 409 });
    }

    // Validate slateIds if provided (must belong to sharing family)
    const validSlateIds: string[] = [];
    if (slateIds && Array.isArray(slateIds)) {
      for (const slateId of slateIds) {
        const slate = await db.select().from(schema.slates).where(
          and(eq(schema.slates.id, slateId), eq(schema.slates.familyId, sharingFamilyId))
        ).limit(1)[0];

        if (slate) {
          validSlateIds.push(slate.id);
        } else {
          warn({ slateId }, `Slate ${slateId} not found or doesn't belong to sharing family`);
        }
      }
    }

    // Create swap meet entry for each valid slate
    const createdEntries: any[] = [];
    const status = "pending";

    for (const slateId of validSlateIds) {
      const entry = await rawInsert("swap_meet", {
        id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        slate_id: slateId,
        sharing_family_id: sharingFamilyId,
        requested_by: requestingFamilyId,
        status,
        created_at: new Date().toISOString(),
      });

      createdEntries.push(entry);

      // Create history entry if needed (requires user ID)
      try {
        await rawInsert("job_history", {
          id: `jh-${Date.now()}`,
          job_id: "swap",
          action: "swap_meet_request",
          details: `Shared slate ${slateId} with family ${requestingFamilyId}`,
          user_id: userId,
          created_at: new Date().toISOString(),
        });
      } catch (historyErr) {
        error({ err: historyErr }, "Failed to create swap meet history");
      }
    }

    return NextResponse.json({
      success: true,
      message: "Swap meet entry created successfully",
      entries: createdEntries,
    });
  } catch (error) {
    error({ err: error }, "Swap meet POST failed");
    if (error instanceof Error && error.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to create swap meet entry", details: String(error) },
      { status: 500 }
    );
  }
}

// ─── Helper: Get Upcoming Assignments ──────────────────────────────
async function getUpcomingAssignments(db: any, familyId: string, daysAhead: number): Promise<any[]> {
  const slates = await db.select().from(schema.slates).where(eq(schema.slates.familyId, familyId));

  if (!slates || (slates as any[]).length === 0) {
    return [];
  }

  const schedule: any[] = [];
  const today = new Date();

  for (const slate of slates as any[]) {
    const rotations = await db.select().from(schema.rotations).where(eq(schema.rotations.slateId, slate.id));

    if (!rotations || (rotations as any[]).length === 0) continue;

    // Calculate upcoming assignments using rotation logic
    const assignments = calculateUpcomingAssignments(rotations as any[], today, daysAhead);

    schedule.push({
      slateId: slate.id,
      slateName: slate.name,
      frequency: slate.frequency,
      interval: slate.interval || 1,
      assignments,
    });
  }

  return schedule.sort((a, b) => {
    // Sort by number of assignments (most active first)
    return b.assignments.length - a.assignments.length;
  });
}

// ─── Helper: Calculate Upcoming Assignments ────────────────────────
function calculateUpcomingAssignments(
  rotations: any[],
  startDate: Date,
  daysAhead: number
): any[] {
  if (!rotations || rotations.length === 0) return [];

  const assignments: any[] = [];
  
  // For each rotation, calculate assignment dates
  for (const rotation of rotations) {
    let currentDate = new Date(startDate);
    let dateStr = currentDate.toISOString().split("T")[0];

    while (dateStr <= getDateOffset(new Date(), daysAhead)) {
      assignments.push({
        date: dateStr,
        userId: rotation.userId,
        isCurrent: false,
        rotationId: rotation.id,
        order: rotation.order,
      });

      // Move to next assignment based on interval
      currentDate = getNextDate(currentDate, rotation.intervalDays || 7);
      dateStr = currentDate.toISOString().split("T")[0];
    }
  }

  return assignments.sort((a, b) => a.date.localeCompare(b.date));
}

function getDateOffset(date: Date, days: number): string {
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + days);
  return newDate.toISOString().split("T")[0];
}

function getNextDate(currentDate: Date, intervalDays: number): Date {
  const next = new Date(currentDate);
  next.setDate(next.getDate() + intervalDays);
  return next;
}
