import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { verifyAuth, canAuthor } from "@/lib/auth";

async function ownedSlate(rawDb: any, slateId: string, householdId: string): Promise<any> {
  return await rawDb.prepare(`SELECT id FROM slates WHERE id = ? AND household_id = ?`).get(slateId, householdId);
}

async function GET(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const slateId = (await params).slateId;
    if (!await ownedSlate(rawDb, slateId, auth.householdId)) {
      return NextResponse.json({ error: "Slate not found" }, { status: 404 });
    }

    const tags = await rawDb.prepare(
      `SELECT t.* FROM tags t INNER JOIN slate_tags st ON t.id = st.tag_id WHERE st.slate_id = ?`
    ).all(slateId) as any[];
    return NextResponse.json(tags || []);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Slate tags GET failed");
    return NextResponse.json({ error: "Failed to fetch slate tags" }, { status: 500 });
  }
}

async function PUT(request: NextRequest, { params }: { params: Promise<{ slateId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const body = await request.json();
    const { tagIds } = body;
    const slateId = (await params).slateId;

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    if (!await ownedSlate(rawDb, slateId, auth.householdId)) {
      return NextResponse.json({ error: "Slate not found" }, { status: 404 });
    }
    for (const tagId of tagIds || []) {
      if (!await rawDb.prepare(`SELECT id FROM tags WHERE id = ? AND household_id = ?`).get(tagId, auth.householdId)) {
        return NextResponse.json({ error: "Tag not found" }, { status: 404 });
      }
    }

    // Remove existing tags
    await rawDb.prepare(`DELETE FROM slate_tags WHERE slate_id = ?`).run(slateId);

    // Add new tags
    if (tagIds) {
      for (const tagId of tagIds) {
        await rawDb.prepare(`INSERT INTO slate_tags (id, slate_id, tag_id) VALUES (?, ?, ?)`).run(`stag-${crypto.randomUUID()}`, slateId, tagId);
      }
    }

    const tags = await rawDb.prepare(
      `SELECT t.* FROM tags t INNER JOIN slate_tags st ON t.id = st.tag_id WHERE st.slate_id = ?`
    ).all(slateId) as any[];
    return NextResponse.json(tags || []);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Slate tags PUT failed");
    return NextResponse.json({ error: "Failed to update slate tags" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
const PUT_impl = withTenant(PUT);
export { PUT_impl as PUT };
