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

    // Get family info
    const familyRow = rawDb.prepare(`SELECT * FROM families WHERE id = ?`).get(familyId) as any;
    const family = familyRow || null;

    // Get all users in the family
    const familyUsers = rawDb.prepare(`SELECT * FROM users WHERE family_id = ?`).all(familyId) as any[];
    const users = familyUsers || [];

    // Get all slates for the family
    const familySlates = rawDb.prepare(`SELECT * FROM slates WHERE family_id = ?`).all(familyId) as any[];

    // Get all rotations for these slates
    const slateIds = (familySlates || []).map((s: any) => s.id);
    const rotations: any[] = [];
    if (slateIds.length > 0) {
      const placeholders = slateIds.map(() => "?").join(",");
      const result = rawDb.prepare(`SELECT * FROM rotations WHERE slate_id IN (${placeholders}) ORDER BY "order"`).all(...slateIds);
      rotations.push(...(result as any[]));
    }

    // Enrich rotations with user info
    const enrichedRotations: any[] = rotations.map((r: any) => {
      const user = users.find((u: any) => u.id === r.user_id || u.id === r.userId);
      return { ...r, userName: user?.name || "Unknown", userAvatarUrl: user?.avatar_url || user?.avatarUrl,
        userPointsTotal: user?.points_total || user?.pointsTotal || 0, userRole: user?.role || "child" };
    });

    // Group rotations by slate
    const slatesWithRotations = (familySlates || []).map((slate: any) => {
      const slateRotations = enrichedRotations.filter((r: any) => r.slate_id === slate.id || r.slateId === slate.id);
      return { ...slate, assignments: slateRotations };
    });

    // Get users not yet assigned to any rotation
    const assignedUserIds = new Set(enrichedRotations.map((r: any) => r.user_id || r.userId));
    const unassignedUsers = (users as any[]).filter((u: any) => !assignedUserIds.has(u.id)).map((u: any) => ({
      ...u, userId: u.id, userName: u.name, userAvatarUrl: u.avatar_url || u.avatarUrl,
      userPointsTotal: u.points_total || u.pointsTotal || 0, userRole: u.role || "child",
    }));

    return NextResponse.json({ family, users: unassignedUsers, slates: slatesWithRotations });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Rotations GET failed");
    return NextResponse.json({ error: "Failed to fetch rotations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) return NextResponse.json({ error: "Family ID required" }, { status: 400 });

    const body = await request.json();
    const { id, slateId, userId, order, intervalDays, isActive } = body;
    if (!slateId || !userId) return NextResponse.json({ error: "slateId and userId are required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const now = new Date().toISOString();
    if (id) {
      // Update existing rotation
      rawDb.prepare(
        `UPDATE rotations SET slate_id = ?, user_id = ?, "order" = ?, interval_days = ?, is_active = ?, updated_at = ? WHERE id = ?`
      ).run(slateId, userId, order || 0, intervalDays || 7, (isActive !== false) ? 1 : 0, now, id);
      const result = rawDb.prepare(`SELECT * FROM rotations WHERE id = ?`).get(id) as any;
      return NextResponse.json(result, { status: 200 });
    } else {
      // Create new rotation
      const rotId = `rot-${Date.now()}`;
      rawDb.prepare(
        `INSERT INTO rotations (id, slate_id, user_id, "order", interval_days, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(rotId, slateId, userId, order || 0, intervalDays || 7, (isActive !== false) ? 1 : 0, now, now);
      const result = rawDb.prepare(`SELECT * FROM rotations WHERE id = ?`).get(rotId) as any;
      return NextResponse.json(result, { status: 201 });
    }
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Rotations POST failed");
    return NextResponse.json({ error: "Failed to save rotation" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) return NextResponse.json({ error: "Family ID required" }, { status: 400 });

    const body = await request.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    rawDb.prepare(`DELETE FROM rotations WHERE id = ?`).run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Rotations DELETE failed");
    return NextResponse.json({ error: "Failed to delete rotation" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  return POST(request);
}
