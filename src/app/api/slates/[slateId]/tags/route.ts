import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { error } from "@/lib/logger.server";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const slateId = (await params).slateId;
    const body = await request.json();
    const { tagIds } = body;

    // Delete existing slate tags for this slate
    await db.delete(schema.slateTags).where(eq(schema.slateTags.slateId, slateId));

    if (!tagIds || tagIds.length === 0) {
      return NextResponse.json({ success: true });
    }

    // Insert new slate tags
    const insertValues = tagIds.map((tagId: string) => ({ slateId, tagId }));
    await db.insert(schema.slateTags).values(insertValues);

    return NextResponse.json({ success: true, count: tagIds.length });
  } catch (error) {
    error({ err: error }, "Slate tags PUT failed");
    return NextResponse.json({ error: "Failed to update slate tags" }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const slateId = (await params).slateId;

    const tags = await db.select({
      slateTag: schema.slateTags,
      tag: schema.tags,
    })
      .from(schema.slateTags)
      .leftJoin(schema.tags, eq(schema.slateTags.tagId, schema.tags.id))
      .where(eq(schema.slateTags.slateId, slateId));

    return NextResponse.json(tags);
  } catch (error) {
    error({ err: error }, "Slate tags GET failed");
    return NextResponse.json({ error: "Failed to fetch slate tags" }, { status: 500 });
  }
}
