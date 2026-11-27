import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { verifyAuth, canAuthor } from "@/lib/auth";
import { error } from "@/lib/logger.server";

async function ownedSlate(rawDb: any, slateId: string, householdId: string): Promise<any> {
  return await rawDb.prepare(`SELECT * FROM slates WHERE id = ? AND household_id = ?`).get(slateId, householdId);
}

function normalize(slate: any) {
  return {
    id: slate.id,
    name: slate.name,
    description: slate.description,
    roomLocation: slate.room_location,
    frequency: slate.frequency,
    interval: slate.interval,
    schedule: slate.schedule,
    isActive: slate.is_active === 1 || slate.is_active === true,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const slate = await ownedSlate(rawDb, (await params).slateId, auth.householdId);
    if (!slate) {
      return NextResponse.json({ error: "Slate not found" }, { status: 404 });
    }

    return NextResponse.json(normalize(slate));
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Slate GET failed");
    return NextResponse.json({ error: "Failed to fetch slate" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const slateId = (await params).slateId;
    if (!await ownedSlate(rawDb, slateId, auth.householdId)) {
      return NextResponse.json({ error: "Slate not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, roomLocation, frequency, interval, schedule, defaultDueDateOffset, isActive } = body;

    const scheduleStr = typeof schedule === "string" ? schedule : JSON.stringify(schedule);

    await rawDb.prepare(
      `UPDATE slates SET name = ?, description = ?, room_location = ?, frequency = ?, interval = ?, schedule = ?, default_due_date_offset = ?, is_active = ? WHERE id = ? AND household_id = ?`
    ).run(name, description || null, roomLocation || null, frequency, interval, scheduleStr || null, defaultDueDateOffset, (isActive !== false) ? 1 : 0, slateId, auth.householdId);

    const updated = await ownedSlate(rawDb, slateId, auth.householdId);
    return NextResponse.json(normalize(updated));
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Slate PUT failed");
    return NextResponse.json({ error: "Failed to update slate" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const slateId = (await params).slateId;
    if (!await ownedSlate(rawDb, slateId, auth.householdId)) {
      return NextResponse.json({ error: "Slate not found" }, { status: 404 });
    }

    // Delete associated entries first (no FK cascades in the SQLite schema)
    await rawDb.prepare(`DELETE FROM slate_tasks WHERE slate_id = ?`).run(slateId);
    await rawDb.prepare(`DELETE FROM slate_tags WHERE slate_id = ?`).run(slateId);
    await rawDb.prepare(`DELETE FROM rotations WHERE slate_id = ?`).run(slateId);
    await rawDb.prepare(`DELETE FROM slates WHERE id = ? AND household_id = ?`).run(slateId, auth.householdId);

    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Slate DELETE failed");
    return NextResponse.json({ error: "Failed to delete slate" }, { status: 500 });
  }
}
