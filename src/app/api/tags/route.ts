import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const searchParams = request.nextUrl.searchParams;
    const familyId = searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required" }, { status: 400 });
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
    console.error("Tags GET failed:", error);
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
    const { name, familyId, color } = body;

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
    console.error("Tags POST failed:", error);
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 });
  }
}
