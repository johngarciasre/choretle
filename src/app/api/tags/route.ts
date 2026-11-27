import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { verifyAuth, canAuthor } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const householdId = auth.householdId;
    if (!householdId) {
      return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    }

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Get tags with task counts using raw SQL (Drizzle ORM fails on SQLite joins+groupBy)
    const tagsWithCounts = await rawDb.prepare(`
      SELECT t.*, COUNT(DISTINCT tt.id) as "taskCount"
      FROM tags t
      LEFT JOIN task_tags tt ON t.id = tt.tag_id
      WHERE t.household_id = ?
      GROUP BY t.id
    `).all(householdId) as any[];

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

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const body = await request.json();
    const { name, color } = body;

    const householdId = auth.householdId;
    if (!householdId) {
      return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Check for duplicate tag name within the same household
    const existing = await rawDb.prepare(
      `SELECT * FROM tags WHERE household_id = ? AND name = ? LIMIT 1`
    ).get(householdId, name) as any;

    if (existing) {
      return NextResponse.json({ error: `Tag name "${name}" already exists in this household` }, { status: 409 });
    }

    const tagId = `tag-${crypto.randomUUID()}`;
    await rawDb.prepare(
      `INSERT INTO tags (id, name, household_id, color, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(tagId, name, householdId, color || null, new Date().toISOString());

    const tag = await rawDb.prepare(`SELECT * FROM tags WHERE id = ?`).get(tagId) as any;

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

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const householdId = auth.householdId;
    if (!householdId) {
      return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    }

    const body = await request.json();
    const { id, name, color } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Get existing tag to check household and new name
    const existingTag = await rawDb.prepare(
      `SELECT * FROM tags WHERE id = ? AND household_id = ?`
    ).get(id, householdId) as any;

    if (!existingTag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    // Check for duplicate name (only if name is changing)
    if (name && name !== existingTag.name) {
      const duplicate = await rawDb.prepare(
        `SELECT * FROM tags WHERE household_id = ? AND name = ? AND id != ? LIMIT 1`
      ).get(householdId, name, id) as any;

      if (duplicate) {
        return NextResponse.json({ error: `Tag name "${name}" already exists in this household` }, { status: 409 });
      }
    }

    await rawDb.prepare(
      `UPDATE tags SET name = ?, color = ? WHERE id = ? AND household_id = ?`
    ).run(name, color || null, id, householdId);

    const updated = await rawDb.prepare(`SELECT * FROM tags WHERE id = ? AND household_id = ?`).get(id, householdId) as any;

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

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const householdId = auth.householdId;
    if (!householdId) {
      return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const owned = await rawDb.prepare(`SELECT id FROM tags WHERE id = ? AND household_id = ?`).get(id, householdId);
    if (!owned) return NextResponse.json({ error: "Tag not found" }, { status: 404 });

    // Delete tag from junction tables first (no FK cascades in the SQLite schema)
    await rawDb.prepare(`DELETE FROM task_tags WHERE tag_id = ?`).run(id);
    await rawDb.prepare(`DELETE FROM slate_tags WHERE tag_id = ?`).run(id);
    await rawDb.prepare(`DELETE FROM tags WHERE id = ? AND household_id = ?`).run(id, householdId);

    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Tags DELETE failed");
    return NextResponse.json({ error: "Failed to delete tag" }, { status: 500 });
  }
}
