import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { verifyAuth } from "@/lib/auth";
import { error } from "@/lib/logger.server";

export async function GET(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Get slates with task counts using raw SQL (Drizzle ORM fails on SQLite joins+groupBy)
    const stmt = rawDb.prepare(`
      SELECT s.*, COUNT(DISTINCT st.id) as taskCount
      FROM slates s
      LEFT JOIN slate_tasks st ON s.id = st.slate_id
      WHERE s.family_id = ?
      GROUP BY s.id
    `);

    const slates = stmt.all(familyId) as any[];

    // Normalize snake_case to camelCase for frontend
    const normalizedSlates = slates.map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      roomLocation: s.room_location,
      frequency: s.frequency,
      interval: s.interval,
      isActive: s.is_active === 1 || s.is_active === true,
      taskCount: s.taskCount || 0,
    }));

    return NextResponse.json(normalizedSlates);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Slates GET failed");
    return NextResponse.json({ error: "Failed to fetch slates" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, roomLocation, frequency, interval, defaultDueDateOffset, isActive } = body;

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const slateId = crypto.randomUUID();

    // Use raw SQL to avoid Drizzle ORM issues with boolean/int conversion
    const stmt = rawDb.prepare(
      `INSERT INTO slates (id, name, family_id, description, room_location, frequency, interval, default_due_date_offset, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    stmt.run(
      slateId,
      name,
      familyId,
      description || null,
      roomLocation || null,
      frequency || "weekly",
      interval || 1,
      defaultDueDateOffset || 0,
      (isActive !== false) ? 1 : 0,
    );

    const slate = rawDb.prepare(`SELECT * FROM slates WHERE id = ?`).get(slateId);

    return NextResponse.json(slate, { status: 201 });
  } catch (err) {
    error({ err: err }, "Slates POST failed");
    return NextResponse.json({ error: "Failed to create slate" }, { status: 500 });
  }
}
