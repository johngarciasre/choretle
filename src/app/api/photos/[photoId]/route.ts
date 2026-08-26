import { NextRequest, NextResponse } from "next/server";
import { initDb, rawDeleteWhere } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { error } from "@/lib/logger.server";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ photoId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const photoId = (await params).photoId;
    const familyId = request.headers.get("x-family-id") || new URL(request.url).searchParams.get("familyId");

    await rawDeleteWhere("photos", [{ col: "id", val: photoId }]);

    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: err }, "Delete photo failed");
    return NextResponse.json({ error: "Failed to delete photo" }, { status: 500 });
  }
}
