import { NextRequest, NextResponse } from "next/server";
import { initDb, getRawDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { error } from "@/lib/logger.server";

export async function GET(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const familyId = request.headers.get("x-family-id") || new URL(request.url).searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json([]);
    }

    // Get slates with task counts
    const result = await db.select({
      slate: schema.slates,
      taskCount: sql<number>`COUNT(DISTINCT ${schema.slateTasks.id})`,
    })
      .from(schema.slates)
      .leftJoin(schema.slateTasks, eq(schema.slates.id, schema.slateTasks.slateId))
      .where(eq(schema.slates.familyId, familyId))
      .groupBy(schema.slates.id);

    const slates = result.map((row: any) => ({
      ...row.slate,
      taskCount: row.taskCount || 0,
    }));

    return NextResponse.json(slates);
  } catch (err) {
    error({ err: err }, "Slates GET failed");
    return NextResponse.json({ error: "Failed to fetch slates" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const body = await request.json();
    const { name, description, roomLocation, frequency, interval, defaultDueDateOffset, isActive } = body;

    const familyId = request.headers.get("x-family-id") || new URL(request.url).searchParams.get("familyId");
    if (!name || !familyId) {
      return NextResponse.json({ error: "name and familyId are required" }, { status: 400 });
    }

    const slateId = crypto.randomUUID();
    const rawDb = getRawDb();
    
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

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
