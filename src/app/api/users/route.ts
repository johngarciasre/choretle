import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { canAuthor, isRestrictedSession, verifyAuth } from "@/lib/auth";
import { getMembershipFor } from "@/lib/membership";

const ROLES = ["parent", "child", "helper"] as const;

interface MemberRow {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  role: string;
  points_total: number;
  household_id: string;
}

function mapUser(u: MemberRow) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatarUrl: u.avatar_url || null,
    householdId: u.household_id || null,
    pointsTotal: u.points_total || 0,
  };
}

const MEMBER_SELECT = `
  select u.id, u.name, u.email, u.avatar_url, m.role, m.points_total, m.household_id
    from memberships m
    join users u on u.id = m.user_id
`;

/** A household with no parent left can never be managed again. */
async function wouldOrphanHousehold(
  householdId: string,
  targetUserId: string,
  newRole: string,
): Promise<boolean> {
  if (newRole === "parent") return false;
  const current = await getMembershipFor(targetUserId, householdId);
  if (current?.role !== "parent") return false;
  const row = (await getDb()
    .prepare(`select count(*) as n from memberships where household_id = ? and role = 'parent'`)
    .get(householdId)) as { n: number | string } | undefined;
  return Number(row?.n ?? 0) <= 1;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });

    const members = (await getDb()
      .prepare(`${MEMBER_SELECT} where m.household_id = ? order by m.joined_at asc`)
      .all(householdId)) as MemberRow[];

    // A PIN session never sees an adult email address.
    const restricted = isRestrictedSession(auth);
    return NextResponse.json({
      users: (members || []).map((member) => {
        const mapped = mapUser(member);
        return restricted ? { ...mapped, email: null } : mapped;
      }),
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Users GET failed");
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    if (!canAuthor(auth)) return NextResponse.json({ error: "Parent access required" }, { status: 403 });

    const body = await request.json();
    const { userId, role } = body;
    if (!userId || !ROLES.includes(role)) {
      return NextResponse.json(
        { error: `userId and role (${ROLES.join(", ")}) are required` },
        { status: 400 },
      );
    }

    const db = getDb();
    const target = await getMembershipFor(userId, householdId);
    if (!target) return NextResponse.json({ error: "User not found in your household" }, { status: 404 });
    if (await wouldOrphanHousehold(householdId, userId, role)) {
      return NextResponse.json({ error: "A household needs at least one parent." }, { status: 400 });
    }

    await db.prepare(`update memberships set role = ? where id = ?`).run(role, target.id);

    const updated = (await db.prepare(`${MEMBER_SELECT} where m.id = ?`).get(target.id)) as MemberRow;
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
    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    if (!canAuthor(auth)) return NextResponse.json({ error: "Parent access required" }, { status: 403 });

    const body = await request.json();
    const { userId } = body;
    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
    if (userId === auth.userId) return NextResponse.json({ error: "You cannot remove yourself." }, { status: 400 });

    const target = await getMembershipFor(userId, householdId);
    if (!target) return NextResponse.json({ error: "User not found in your household" }, { status: 404 });
    if (await wouldOrphanHousehold(householdId, userId, "child")) {
      return NextResponse.json({ error: "A household needs at least one parent." }, { status: 400 });
    }

    // Detach the membership, keep the person and their history.
    await getDb().prepare(`delete from memberships where id = ?`).run(target.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Users DELETE failed");
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
