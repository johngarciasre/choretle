import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const familyId = request.headers.get("x-family-id");

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
  } catch (error) {
    console.error("Slates GET failed:", error);
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

    const familyId = request.headers.get("x-family-id");
    if (!name || !familyId) {
      return NextResponse.json({ error: "name and familyId are required" }, { status: 400 });
    }

    const slate = await db.insert(schema.slates).values({
      name,
      familyId,
      description,
      roomLocation,
      frequency: frequency || "weekly",
      interval: interval || 1,
      defaultDueDateOffset: defaultDueDateOffset || 0,
      isActive: isActive !== false,
    }).returning("*");

    return NextResponse.json(slate[0], { status: 201 });
  } catch (error) {
    console.error("Slates POST failed:", error);
    return NextResponse.json({ error: "Failed to create slate" }, { status: 500 });
  }
}
