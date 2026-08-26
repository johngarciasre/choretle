import { NextRequest, NextResponse } from "next/server";
import { initDb, rawDeleteWhere } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { error } from "@/lib/logger.server";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ rotationId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const rotationId = (await params).rotationId;

    await rawDeleteWhere("rotations", [{ col: "id", val: rotationId }]);

    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: err }, "Rotation DELETE failed");
    return NextResponse.json({ error: "Failed to delete rotation" }, { status: 500 });
  }
}
