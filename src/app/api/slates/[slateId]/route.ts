import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const slateId = (await params).slateId;
    
    const slate = await db.select().from(schema.slates).where(eq(schema.slates.id, slateId)).limit(1);
    
    if (!slate || !slate[0]) {
      return NextResponse.json({ error: "Slate not found" }, { status: 404 });
    }

    return NextResponse.json(slate[0]);
  } catch (error) {
    console.error("Slate GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch slate" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const slateId = (await params).slateId;
    const body = await request.json();
    const { name, description, roomLocation, frequency, interval, defaultDueDateOffset, isActive } = body;

    const result = await db.update(schema.slates)
      .set({ name, description, roomLocation, frequency, interval, defaultDueDateOffset, isActive })
      .where(eq(schema.slates.id, slateId))
      .returning("*");

    if (!result || !result[0]) {
      return NextResponse.json({ error: "Slate not found" }, { status: 404 });
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error("Slate PUT failed:", error);
    return NextResponse.json({ error: "Failed to update slate" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const slateId = (await params).slateId;
    
    // Delete associated entries first (cascade via FK constraints in PostgreSQL)
    await db.delete(schema.slateTasks).where(eq(schema.slateTasks.slateId, slateId));
    await db.delete(schema.rotations).where(eq(schema.rotations.slateId, slateId));
    await db.delete(schema.slateTags).where(eq(schema.slateTags.slateId, slateId));
    await db.delete(schema.slates).where(eq(schema.slates.id, slateId));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Slate DELETE failed:", error);
    return NextResponse.json({ error: "Failed to delete slate" }, { status: 500 });
  }
}
