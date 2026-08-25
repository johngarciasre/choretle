import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { error } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const familyId = request.headers.get("x-family-id") || new URL(request.url).searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json([]);
    }

    // Get tags with task counts
    const tagsWithCounts = await db.select({
      tag: schema.tags,
      taskCount: sql<number>`COUNT(DISTINCT ${schema.taskTags.taskId})`,
    })
      .from(schema.tags)
      .leftJoin(schema.taskTags, eq(schema.tags.id, schema.taskTags.tagId))
      .where(eq(schema.tags.familyId, familyId))
      .groupBy(schema.tags.id);

    const result = tagsWithCounts.map((row: any) => ({
      ...row.tag,
      taskCount: row.taskCount || 0,
    }));

    return NextResponse.json(result);
  } catch (error) {
    error({ err: error }, "Tags GET failed");
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const body = await request.json();
    const { name, color } = body;

    const familyId = request.headers.get("x-family-id") || new URL(request.url).searchParams.get("familyId");
    if (!name || !familyId) {
      return NextResponse.json({ error: "name and familyId are required" }, { status: 400 });
    }

    const tag = await db.insert(schema.tags).values({
      name,
      familyId,
      color,
    }).returning("*");

    return NextResponse.json(tag[0], { status: 201 });
  } catch (error) {
    error({ err: error }, "Tags POST failed");
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const body = await request.json();
    const { id, name, color } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const result = await db.update(schema.tags)
      .set({ name, color })
      .where(eq(schema.tags.id, id))
      .returning("*");

    if (!result || !result[0]) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    error({ err: error }, "Tags PUT failed");
    return NextResponse.json({ error: "Failed to update tag" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Delete tag from junction tables first (cascade via FK constraints in PostgreSQL)
    await db.delete(schema.taskTags).where(eq(schema.taskTags.tagId, id));
    await db.delete(schema.slateTags).where(eq(schema.slateTags.tagId, id));
    await db.delete(schema.tags).where(eq(schema.tags.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    error({ err: error }, "Tags DELETE failed");
    return NextResponse.json({ error: "Failed to delete tag" }, { status: 500 });
  }
}
