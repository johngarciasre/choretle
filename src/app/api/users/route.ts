import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) return NextResponse.json({ error: "Family ID required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const users = rawDb.prepare(`SELECT * FROM users WHERE family_id = ?`).all(familyId) as any[];
    return NextResponse.json(users || []);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Users GET failed");
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
