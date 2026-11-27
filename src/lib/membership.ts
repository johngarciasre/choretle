/**
 * The tenancy seam.
 *
 * Everything that needs "which household is this request acting in, and what may
 * this person do there" goes through here. When memberships were introduced the
 * whole app kept working by changing this one function, and a future
 * multi-household switcher only needs to change how `preferred` is chosen.
 */

import { getDb } from "@/db";

export type Role = "parent" | "child" | "helper";

export interface Membership {
  id: string;
  userId: string;
  householdId: string;
  role: Role;
  pointsTotal: number;
}

interface MembershipRow {
  id: string;
  user_id: string;
  household_id: string;
  role: string;
  points_total: number;
}

function toMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    userId: row.user_id,
    householdId: row.household_id,
    role: (row.role as Role) || "child",
    pointsTotal: row.points_total || 0,
  };
}

/**
 * Resolve the membership a request acts through.
 *
 * `preferred` is only honoured when a membership actually exists for that
 * household — a client naming somebody else's household falls back to the
 * caller's own, so the header/cookie can never widen access.
 */
export async function getMembership(
  userId: string,
  preferred?: string | null,
): Promise<Membership | null> {
  const db = getDb();
  const row = (await db
    .prepare(
      `select m.id, m.user_id, m.household_id, m.role, m.points_total
         from memberships m
        where m.user_id = ?
        order by (m.household_id = ?) desc, m.joined_at asc
        limit 1`,
    )
    .get(userId, preferred || "")) as MembershipRow | undefined;
  return row ? toMembership(row) : null;
}

export async function getMemberships(userId: string): Promise<Membership[]> {
  const db = getDb();
  const rows = (await db
    .prepare(
      `select m.id, m.user_id, m.household_id, m.role, m.points_total
         from memberships m
        where m.user_id = ?
        order by m.joined_at asc`,
    )
    .all(userId)) as MembershipRow[];
  return rows.map(toMembership);
}

export async function getMembershipFor(
  userId: string,
  householdId: string,
): Promise<Membership | null> {
  const db = getDb();
  const row = (await db
    .prepare(
      `select m.id, m.user_id, m.household_id, m.role, m.points_total
         from memberships m
        where m.user_id = ? and m.household_id = ?`,
    )
    .get(userId, householdId)) as MembershipRow | undefined;
  return row ? toMembership(row) : null;
}

export async function getMembershipById(
  id: string,
  householdId: string,
): Promise<Membership | null> {
  const db = getDb();
  const row = (await db
    .prepare(
      `select m.id, m.user_id, m.household_id, m.role, m.points_total
         from memberships m
        where m.id = ? and m.household_id = ?`,
    )
    .get(id, householdId)) as MembershipRow | undefined;
  return row ? toMembership(row) : null;
}
