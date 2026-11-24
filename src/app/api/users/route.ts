import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

const ROLES = ["parent", "child"] as const;

function mapUser(u: any) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatarUrl: u.avatar_url || null,
    familyId: u.family_id || null,
    pointsTotal: u.points_total || 0,
  };
}

/** A family with no parent left can never be managed again. */
function wouldOrphanFamily(rawDb: any, familyId: string, target: any, newRole: string): boolean {
  if (target.role !== "parent" || newRole === "parent") return false;
  const parents = rawDb.prepare(`SELECT COUNT(*) as n FROM users WHERE family_id = ? AND role = 'parent'`).get(familyId) as any;
  return (parents?.n || 0) <= 1;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const familyId = auth.familyId;
    if (!familyId) return NextResponse.json({ error: "Family ID required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const users = rawDb.prepare(`SELECT * FROM users WHERE family_id = ? ORDER BY created_at`).all(familyId) as any[];
    return NextResponse.json({ users: (users || []).map(mapUser) });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Users GET failed");
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const familyId = auth.familyId;
    if (!familyId) return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    if (auth.role !== "parent") return NextResponse.json({ error: "Parent access required" }, { status: 403 });

    const body = await request.json();
    const { userId, role } = body;
    if (!userId || !ROLES.includes(role)) {
      return NextResponse.json({ error: `userId and role (${ROLES.join(" or ")}) are required` }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const target = rawDb.prepare(`SELECT id, role FROM users WHERE id = ? AND family_id = ?`).get(userId, familyId) as any;
    if (!target) return NextResponse.json({ error: "User not found in your family" }, { status: 404 });
    if (wouldOrphanFamily(rawDb, familyId, target, role)) {
      return NextResponse.json({ error: "A family needs at least one parent." }, { status: 400 });
    }

    rawDb.prepare(`UPDATE users SET role = ?, updated_at = ? WHERE id = ? AND family_id = ?`)
      .run(role, new Date().toISOString(), userId, familyId);

    const updated = rawDb.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as any;
    return NextResponse.json({ success: true, user: mapUser(updated) });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Users PUT failed");
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const familyId = auth.familyId;
    if (!familyId) return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    if (auth.role !== "parent") return NextResponse.json({ error: "Parent access required" }, { status: 403 });

    const body = await request.json();
    const { userId } = body;
    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
    if (userId === auth.userId) return NextResponse.json({ error: "You cannot remove yourself." }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const target = rawDb.prepare(`SELECT id, role FROM users WHERE id = ? AND family_id = ?`).get(userId, familyId) as any;
    if (!target) return NextResponse.json({ error: "User not found in your family" }, { status: 404 });
    if (wouldOrphanFamily(rawDb, familyId, target, "child")) {
      return NextResponse.json({ error: "A family needs at least one parent." }, { status: 400 });
    }

    // Detach rather than delete: their completed chores stay in the family's history.
    rawDb.prepare(`UPDATE users SET family_id = NULL, updated_at = ? WHERE id = ? AND family_id = ?`)
      .run(new Date().toISOString(), userId, familyId);

    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Users DELETE failed");
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
