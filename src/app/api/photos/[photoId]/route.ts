import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ photoId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const photoId = (await params).photoId;
    const familyId = request.headers.get("x-family-id");

    await db.delete(schema.photos).where(eq(schema.photos.id, photoId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete photo failed:", error);
    return NextResponse.json({ error: "Failed to delete photo" }, { status: 500 });
  }
}
