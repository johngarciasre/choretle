import { NextRequest, NextResponse } from "next/server";
import { initDb, rawDeleteWhere } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { error } from "@/lib/logger.server";

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
  } catch (err) {
    error({ err: err }, "Slate GET failed");
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
  } catch (err) {
    error({ err: err }, "Slate PUT failed");
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
    await rawDeleteWhere("slate_tasks", [{ col: "slate_id", val: slateId }]);
    await rawDeleteWhere("rotations", [{ col: "slate_id", val: slateId }]);
    await rawDeleteWhere("slate_tags", [{ col: "slate_id", val: slateId }]);
    await rawDeleteWhere("slates", [{ col: "id", val: slateId }]);
    
    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: err }, "Slate DELETE failed");
    return NextResponse.json({ error: "Failed to delete slate" }, { status: 500 });
  }
}
