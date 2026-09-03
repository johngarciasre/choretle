import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Get tags with task counts using raw SQL (Drizzle ORM fails on SQLite joins+groupBy)
    const tagsWithCounts = rawDb.prepare(`
      SELECT t.*, COUNT(DISTINCT tt.id) as taskCount
      FROM tags t
      LEFT JOIN task_tags tt ON t.id = tt.tag_id
      WHERE t.family_id = ?
      GROUP BY t.id
    `).all(familyId) as any[];

    return NextResponse.json(tagsWithCounts);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Tags GET failed");
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { name, color } = body;

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Check for duplicate tag name within the same family
    const existing = rawDb.prepare(
      `SELECT * FROM tags WHERE family_id = ? AND name = ? LIMIT 1`
    ).get(familyId, name) as any;

    if (existing) {
      return NextResponse.json({ error: `Tag name "${name}" already exists in this family` }, { status: 409 });
    }

    const tagId = `tag-${Date.now()}`;
    rawDb.prepare(
      `INSERT INTO tags (id, name, family_id, color, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(tagId, name, familyId, color || null, new Date().toISOString());

    const tag = rawDb.prepare(`SELECT * FROM tags WHERE id = ?`).get(tagId) as any;

    return NextResponse.json(tag, { status: 201 });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Tags POST failed");
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    const body = await request.json();
    const { id, name, color } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Get existing tag to check family and new name
    const existingTag = rawDb.prepare(
      `SELECT * FROM tags WHERE id = ?`
    ).get(id) as any;

    if (!existingTag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    // Check for duplicate name (only if name is changing)
    if (name && name !== existingTag.name) {
      const duplicate = rawDb.prepare(
        `SELECT * FROM tags WHERE family_id = ? AND name = ? AND id != ? LIMIT 1`
      ).get(existingTag.family_id, name, id) as any;

      if (duplicate) {
        return NextResponse.json({ error: `Tag name "${name}" already exists in this family` }, { status: 409 });
      }
    }

    rawDb.prepare(
      `UPDATE tags SET name = ?, color = ? WHERE id = ?`
    ).run(name, color || null, id);

    const updated = rawDb.prepare(`SELECT * FROM tags WHERE id = ?`).get(id) as any;

    return NextResponse.json(updated);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Tags PUT failed");
    return NextResponse.json({ error: "Failed to update tag" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Accept familyId from query param as fallback (dev mode without middleware headers)
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Delete tag from junction tables first (cascade via FK constraints in PostgreSQL)
    rawDb.prepare(`DELETE FROM task_tags WHERE tag_id = ?`).run(id);
    rawDb.prepare(`DELETE FROM slate_tags WHERE tag_id = ?`).run(id);
    rawDb.prepare(`DELETE FROM tags WHERE id = ?`).run(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Tags DELETE failed");
    return NextResponse.json({ error: "Failed to delete tag" }, { status: 500 });
  }
}
