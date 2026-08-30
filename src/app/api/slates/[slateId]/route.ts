import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const slateId = (await params).slateId;
    
    const slate = rawDb.prepare(`SELECT * FROM slates WHERE id = ?`).get(slateId) as any;
    
    if (!slate) {
      return NextResponse.json({ error: "Slate not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: slate.id,
      name: slate.name,
      description: slate.description,
      roomLocation: slate.room_location,
      frequency: slate.frequency,
      interval: slate.interval,
      isActive: slate.is_active === 1 || slate.is_active === true,
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Slate GET failed");
    return NextResponse.json({ error: "Failed to fetch slate" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const slateId = (await params).slateId;
    const body = await request.json();
    const { name, description, roomLocation, frequency, interval, defaultDueDateOffset, isActive } = body;

    rawDb.prepare(
      `UPDATE slates SET name = ?, description = ?, room_location = ?, frequency = ?, interval = ?, default_due_date_offset = ?, is_active = ? WHERE id = ?`
    ).run(name, description || null, roomLocation || null, frequency, interval, defaultDueDateOffset, (isActive !== false) ? 1 : 0, slateId);

    const updated = rawDb.prepare(`SELECT * FROM slates WHERE id = ?`).get(slateId) as any;
    
    if (!updated) {
      return NextResponse.json({ error: "Slate not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      roomLocation: updated.room_location,
      frequency: updated.frequency,
      interval: updated.interval,
      isActive: updated.is_active === 1 || updated.is_active === true,
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Slate PUT failed");
    return NextResponse.json({ error: "Failed to update slate" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const slateId = (await params).slateId;
    
    // Delete associated entries first (cascade via FK constraints in PostgreSQL)
    rawDb.prepare(`DELETE FROM slate_tasks WHERE slate_id = ?`).run(slateId);
    rawDb.prepare(`DELETE FROM rotations WHERE slate_id = ?`).run(slateId);
    rawDb.prepare(`DELETE FROM slate_tags WHERE slate_id = ?`).run(slateId);
    rawDb.prepare(`DELETE FROM slates WHERE id = ?`).run(slateId);
    
    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Slate DELETE failed");
    return NextResponse.json({ error: "Failed to delete slate" }, { status: 500 });
  }
}
