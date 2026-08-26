import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { error } from "@/lib/logger.server";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const familyId = url.searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json({ ok: false, error: "Family ID is required" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const users = await db.select().from(schema.users).where(eq(schema.users.familyId, familyId));

    return NextResponse.json({ ok: true, users });
  } catch (err) {
    error({ err }, "Users GET failed");
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
