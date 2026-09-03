import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const { searchParams } = new URL(request.url);
    const objectType = searchParams.get("objectType");
    const objectId = searchParams.get("objectId");
    const familyId = auth.familyId || searchParams.get("familyId");
    if (!familyId) return NextResponse.json({ error: "Family ID required" }, { status: 400 });

    let photos: any[];
    if (objectType && objectId) {
      photos = rawDb.prepare(`SELECT * FROM photos WHERE family_id = ? AND object_type = ? AND object_id = ? ORDER BY "order"`).all(familyId, objectType, objectId) as any[];
    } else {
      photos = rawDb.prepare(`SELECT * FROM photos WHERE family_id = ? ORDER BY "order" DESC`).all(familyId) as any[];
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

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const body = await request.json();
    const { objectType, objectId, url, title, type, isProbative, order } = body;
    const familyId = auth.familyId || new URL(request.url).searchParams.get("familyId");
    if (!familyId) return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    if (!objectType || !objectId || !url) return NextResponse.json({ error: "objectType, objectId, and url are required" }, { status: 400 });

    const now = new Date().toISOString();
    const photoId = `photo-${Date.now()}`;
    rawDb.prepare(
      `INSERT INTO photos (id, family_id, object_type, object_id, url, title, type, is_probative, "order", created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(photoId, familyId, objectType, objectId, url, title || null, type || "probative", (isProbative ?? false) ? 1 : 0, order ?? 0, now);

    const photo = rawDb.prepare(`SELECT * FROM photos WHERE id = ?`).get(photoId) as any;
    return NextResponse.json(photo);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Create photo failed");
    return NextResponse.json({ error: "Failed to create photo" }, { status: 500 });
  }
}
