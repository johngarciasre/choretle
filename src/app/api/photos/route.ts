import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const { searchParams } = new URL(request.url);
    const objectType = searchParams.get("objectType");
    const objectId = searchParams.get("objectId");
    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });

    let photos: any[];
    if (objectType && objectId) {
      photos = await rawDb.prepare(`SELECT * FROM photos WHERE household_id = ? AND object_type = ? AND object_id = ? ORDER BY "order"`).all(householdId, objectType, objectId) as any[];
    } else {
      photos = await rawDb.prepare(`SELECT * FROM photos WHERE household_id = ? ORDER BY "order" DESC`).all(householdId) as any[];
    }
    return NextResponse.json(photos);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Get photos failed");
    return NextResponse.json({ error: "Failed to fetch photos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const body = await request.json();
    const { objectType, objectId, url, title, type, isProbative, order } = body;
    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    if (!objectType || !objectId || !url) return NextResponse.json({ error: "objectType, objectId, and url are required" }, { status: 400 });

    const now = new Date().toISOString();
    const photoId = `photo-${crypto.randomUUID()}`;
    await rawDb.prepare(
      `INSERT INTO photos (id, household_id, object_type, object_id, url, title, type, is_probative, "order", created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(photoId, householdId, objectType, objectId, url, title || null, type || "probative", (isProbative ?? false) ? 1 : 0, order ?? 0, now);

    const photo = await rawDb.prepare(`SELECT * FROM photos WHERE id = ?`).get(photoId) as any;
    return NextResponse.json(photo);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Create photo failed");
    return NextResponse.json({ error: "Failed to create photo" }, { status: 500 });
  }
}
