import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { verifyAuth, canAuthor } from "@/lib/auth";

async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    // Get household info
    const householdRow = await rawDb.prepare(`SELECT * FROM households WHERE id = ?`).get(householdId) as any;
    const household = householdRow || null;

    // Get all users in the household
    const householdUsers = await rawDb.prepare(`SELECT u.id, u.name, u.email, u.avatar_url, m.role, m.points_total FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.household_id = ?`).all(householdId) as any[];
    const users = householdUsers || [];

    // Get all slates for the household
    const householdSlates = await rawDb.prepare(`SELECT * FROM slates WHERE household_id = ?`).all(householdId) as any[];

    // Get all rotations for these slates
    const slateIds = (householdSlates || []).map((s: any) => s.id);
    const rotations: any[] = [];
    if (slateIds.length > 0) {
      const placeholders = slateIds.map(() => "?").join(",");
      const result = await rawDb.prepare(`SELECT * FROM rotations WHERE slate_id IN (${placeholders}) ORDER BY "order"`).all(...slateIds);
      rotations.push(...(result as any[]));
    }

    // Enrich rotations with user info. Rows come back in snake_case, but the
    // board (and POST body) speak camelCase, so expose both spellings.
    const enrichedRotations: any[] = rotations.map((r: any) => {
      const user = users.find((u: any) => u.id === r.user_id);
      return {
        ...r,
        slateId: r.slate_id,
        userId: r.user_id,
        intervalDays: r.interval_days,
        isActive: Boolean(r.is_active),
        userName: user?.name || "Unknown",
        userAvatarUrl: user?.avatar_url || user?.avatarUrl,
        userPointsTotal: user?.points_total || user?.pointsTotal || 0,
        userRole: user?.role || "child",
      };
    });

    // Group rotations by slate (deduplicate by user_id to handle edge cases)
    const slatesWithRotations = (householdSlates || []).map((slate: any) => {
      const slateRotations = enrichedRotations.filter((r: any) => r.slateId === slate.id);
      // Deduplicate: keep only the first assignment per userId
      const seen = new Set<string>();
      const uniqueAssignments = slateRotations.filter((r: any) => {
        if (seen.has(r.userId)) return false;
        seen.add(r.userId);
        return true;
      });
      return { ...slate, assignments: uniqueAssignments };
    });

    // Get all users in the household with normalized field names
    const allUsers = (users as any[]).map((u: any) => ({
      ...u, userId: u.id, userName: u.name, userAvatarUrl: u.avatar_url || u.avatarUrl,
      userPointsTotal: u.points_total || u.pointsTotal || 0, userRole: u.role || "child",
    }));

    return NextResponse.json({ household, users: allUsers, slates: slatesWithRotations });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Rotations GET failed");
    return NextResponse.json({ error: "Failed to fetch rotations" }, { status: 500 });
  }
}

async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });

    const body = await request.json();
    const { id, slateId, userId, order, intervalDays, isActive } = body;
    if (!slateId || !userId) return NextResponse.json({ error: "slateId and userId are required" }, { status: 400 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    // Both the slate and the assignee must belong to the caller's household.
    if (!await rawDb.prepare(`SELECT id FROM slates WHERE id = ? AND household_id = ?`).get(slateId, householdId)) {
      return NextResponse.json({ error: "Slate not found" }, { status: 404 });
    }
    if (!await rawDb.prepare(`SELECT user_id FROM memberships WHERE user_id = ? AND household_id = ?`).get(userId, householdId)) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (id) {
      // Update existing rotation
      const changed = await rawDb.prepare(
        `UPDATE rotations SET slate_id = ?, user_id = ?, "order" = ?, interval_days = ?, is_active = ?
         WHERE id = ? AND slate_id IN (SELECT id FROM slates WHERE household_id = ?)`
      ).run(slateId, userId, order || 0, intervalDays || 7, (isActive !== false) ? 1 : 0, id, householdId);
      if (changed.changes === 0) return NextResponse.json({ error: "Rotation not found" }, { status: 404 });
      const result = await rawDb.prepare(`SELECT * FROM rotations WHERE id = ?`).get(id) as any;
      return NextResponse.json(result, { status: 200 });
    } else {
      // Create new rotation
      const rotId = `rot-${crypto.randomUUID()}`;
      await rawDb.prepare(
        `INSERT INTO rotations (id, slate_id, user_id, "order", interval_days, is_active) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(rotId, slateId, userId, order || 0, intervalDays || 7, (isActive !== false) ? 1 : 0);
      const result = await rawDb.prepare(`SELECT * FROM rotations WHERE id = ?`).get(rotId) as any;
      return NextResponse.json(result, { status: 201 });
    }
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Rotations POST failed");
    return NextResponse.json({ error: "Failed to save rotation" }, { status: 500 });
  }
}

async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    if (!canAuthor(auth)) {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });

    const body = await request.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const result = await rawDb.prepare(
      `DELETE FROM rotations WHERE id = ? AND slate_id IN (SELECT id FROM slates WHERE household_id = ?)`
    ).run(id, householdId);
    if (result.changes === 0) return NextResponse.json({ error: "Rotation not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Rotations DELETE failed");
    return NextResponse.json({ error: "Failed to delete rotation" }, { status: 500 });
  }
}

async function PUT(request: NextRequest) {
  return POST(request);
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
const POST_impl = withTenant(POST);
export { POST_impl as POST };
const PUT_impl = withTenant(PUT);
export { PUT_impl as PUT };
const DELETE_impl = withTenant(DELETE);
export { DELETE_impl as DELETE };
