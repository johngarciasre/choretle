import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { canAuthor, isRestrictedSession, verifyAuth } from "@/lib/auth";

async function GET(request: NextRequest, { params }: { params: Promise<{ householdId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const db = getDb();
    const householdId = (await params).householdId;
    if (householdId !== auth.householdId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const household = (await db
      .prepare(`select id, name, slug, timezone, week_start_day, theme, teams_enabled from households where id = ?`)
      .get(householdId)) as any;
    if (!household) return NextResponse.json({ error: "Household not found" }, { status: 404 });

    const users = (await db
      .prepare(
        `select u.id, u.name, u.email, u.avatar_url, m.role, m.points_total
           from memberships m join users u on u.id = m.user_id
          where m.household_id = ?
          order by m.joined_at asc`,
      )
      .all(householdId)) as any[];

    return NextResponse.json({
      id: household.id,
      name: household.name,
      slug: household.slug,
      timezone: household.timezone || "America/New_York",
      weekStartDay: household.week_start_day ?? 0,
      theme: household.theme || "coral",
      teamsEnabled: household.teams_enabled ?? false,
      users: (users || []).map((u: any) => ({
        id: u.id,
        name: u.name,
        email: isRestrictedSession(auth) ? null : u.email,
        role: u.role,
        avatarUrl: u.avatar_url,
        pointsTotal: u.points_total || 0,
      })),
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Household GET failed");
    return NextResponse.json({ error: "Failed to fetch household" }, { status: 500 });
  }
}

async function PUT(request: NextRequest, { params }: { params: Promise<{ householdId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    if ((await params).householdId !== householdId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const { name, slug, timezone, weekStartDay, theme, teamsEnabled } = body;
    const db = getDb();

    if (!canAuthor(auth)) return NextResponse.json({ error: "Parent access required" }, { status: 403 });

    const updates: string[] = ["updated_at = ?"];
    const values: any[] = [new Date().toISOString()];
    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (slug !== undefined) {
      const clash = await db
        .prepare(`select id from households where slug = ? and id != ?`)
        .get(slug, householdId);
      if (clash) return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
      updates.push("slug = ?");
      values.push(slug);
    }
    if (timezone !== undefined) {
      updates.push("timezone = ?");
      values.push(timezone);
    }
    if (weekStartDay !== undefined) {
      updates.push("week_start_day = ?");
      values.push(weekStartDay);
    }
    if (theme !== undefined) {
      updates.push("theme = ?");
      values.push(theme);
    }
    if (teamsEnabled !== undefined) {
      updates.push("teams_enabled = ?");
      values.push(Boolean(teamsEnabled));
    }
    values.push(householdId);

    await db.prepare(`update households set ${updates.join(", ")} where id = ?`).run(...values);

    const updated = (await db
      .prepare(`select id, name, slug, timezone, week_start_day, theme, teams_enabled from households where id = ?`)
      .get(householdId)) as any;
    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      timezone: updated.timezone || "America/New_York",
      weekStartDay: updated.week_start_day ?? 0,
      theme: updated.theme || "coral",
      teamsEnabled: updated.teams_enabled ?? false,
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Household PUT failed");
    return NextResponse.json({ error: "Failed to update household" }, { status: 500 });
  }
}

async function DELETE(request: NextRequest, { params }: { params: Promise<{ householdId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    if ((await params).householdId !== householdId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const db = getDb();
    if (!canAuthor(auth)) return NextResponse.json({ error: "Parent access required" }, { status: 403 });

    // Memberships cascade with the household; people without another household go too.
    const memberIds = (await db
      .prepare(`select user_id from memberships where household_id = ?`)
      .all(householdId)) as { user_id: string }[];
    await db.prepare(`delete from households where id = ?`).run(householdId);
    for (const member of memberIds) {
      await db
        .prepare(`delete from users where id = ? and not exists (select 1 from memberships where user_id = ?)`)
        .run(member.user_id, member.user_id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Household DELETE failed");
    return NextResponse.json({ error: "Failed to delete household" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
const PUT_impl = withTenant(PUT);
export { PUT_impl as PUT };
const DELETE_impl = withTenant(DELETE);
export { DELETE_impl as DELETE };
