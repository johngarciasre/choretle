import { NextRequest, NextResponse } from "next/server";
import { initDb, rawInsert } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { error } from "@/lib/logger.server";

export async function GET(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const objectType = searchParams.get("objectType");
    const objectId = searchParams.get("objectId");
    const familyId = request.headers.get("x-family-id") || new URL(request.url).searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    let query = db.select().from(schema.photos).where({ familyId }).orderBy(desc(schema.photos.order));

    if (objectType && objectId) {
      query = db.select().from(schema.photos).where({ familyId, objectType, objectId }).orderBy(schema.photos.order);
    }

    const photos = await (query as any);
    return NextResponse.json(photos);
  } catch (error) {
    error({ err: error }, "Get photos failed");
    return NextResponse.json({ error: "Failed to fetch photos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const body = await request.json();
    const { objectType, objectId, url, title, type, isProbative, order } = body;
    const familyId = request.headers.get("x-family-id") || new URL(request.url).searchParams.get("familyId");

    if (!familyId || !objectType || !objectId || !url) {
      return NextResponse.json({ error: "objectType, objectId, and url are required" }, { status: 400 });
    }

    const photo = await rawInsert("photos", {
      id: `photo-${Date.now()}`,
      family_id: familyId,
      object_type: objectType,
      object_id: objectId,
      url,
      title: title || null,
      type: type || "probative",
      is_probative: isProbative ?? false,
      "order": order ?? 0,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json(photo);
  } catch (error) {
    error({ err: error }, "Create photo failed");
    return NextResponse.json({ error: "Failed to create photo" }, { status: 500 });
  }
}
