import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { verifyAuth, canAuthor } from "@/lib/auth";
import { error } from "@/lib/logger.server";

async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const householdId = auth.householdId;
    if (!householdId) {
      return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    }

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Get slates with task counts
    const slates = (await rawDb
      .prepare(
        `SELECT s.*, COUNT(DISTINCT st.id) as "taskCount"
      FROM slates s
      LEFT JOIN slate_tasks st ON s.id = st.slate_id
      WHERE s.household_id = ?
      GROUP BY s.id`,
      )
      .all(householdId)) as any[];

    // Normalize snake_case to camelCase for frontend
    const normalizedSlates = slates.map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      roomLocation: s.room_location,
      frequency: s.frequency,
      interval: s.interval,
      schedule: s.schedule,
      isActive: s.is_active === 1 || s.is_active === true,
      taskCount: s.taskCount || 0,
    }));

    return NextResponse.json(normalizedSlates);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Slates GET failed");
    return NextResponse.json({ error: "Failed to fetch slates" }, { status: 500 });
  }
}

async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, roomLocation, frequency, interval, schedule, defaultDueDateOffset, isActive } = body;

    const householdId = auth.householdId;
    if (!householdId) {
      return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const slateId = crypto.randomUUID();

    // Use raw SQL to avoid Drizzle ORM issues with boolean/int conversion
    const scheduleStr = typeof schedule === "string" ? schedule : JSON.stringify(schedule);
    const stmt = await rawDb.prepare(
      `INSERT INTO slates (id, name, household_id, description, room_location, frequency, interval, schedule, default_due_date_offset, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    stmt.run(
      slateId,
      name,
      householdId,
      description || null,
      roomLocation || null,
      frequency || "weekly",
      interval || 1,
      scheduleStr || null,
      defaultDueDateOffset || 0,
      (isActive !== false) ? 1 : 0,
    );

    const slate = await rawDb.prepare(`SELECT * FROM slates WHERE id = ?`).get(slateId);

    return NextResponse.json(slate, { status: 201 });
  } catch (err) {
    error({ err: err }, "Slates POST failed");
    return NextResponse.json({ error: "Failed to create slate" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
const POST_impl = withTenant(POST);
export { POST_impl as POST };
