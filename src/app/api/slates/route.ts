import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const searchParams = request.nextUrl.searchParams;
    const familyId = searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required" }, { status: 400 });
    }

    const slates = await db.select().from(schema.slates).where(eq(schema.slates.familyId, familyId));
    
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
    const { name, familyId, description, roomLocation, frequency, interval, defaultDueDateOffset, isActive } = body;

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
