import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const slateId = (await params).slateId;
    const tags = rawDb.prepare(
      `SELECT t.* FROM tags t INNER JOIN slate_tags st ON t.id = st.tag_id WHERE st.slate_id = ?`
    ).all(slateId) as any[];
    return NextResponse.json(tags || []);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Slate tags GET failed");
    return NextResponse.json({ error: "Failed to fetch slate tags" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const body = await request.json();
    const { tagIds } = body;
    const slateId = (await params).slateId;

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    // Remove existing tags
    rawDb.prepare(`DELETE FROM slate_tags WHERE slate_id = ?`).run(slateId);

    // Add new tags
    if (tagIds) {
      for (const tagId of tagIds) {
        rawDb.prepare(`INSERT INTO slate_tags (id, slate_id, tag_id) VALUES (?, ?, ?)`).run(`stag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, slateId, tagId);
      }
    }

    const tags = rawDb.prepare(
      `SELECT t.* FROM tags t INNER JOIN slate_tags st ON t.id = st.tag_id WHERE st.slate_id = ?`
    ).all(slateId) as any[];
    return NextResponse.json(tags || []);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Slate tags PUT failed");
    return NextResponse.json({ error: "Failed to update slate tags" }, { status: 500 });
  }
}
