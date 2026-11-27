import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { verifyPicker } from "@/lib/auth";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { noCache } from "@/lib/http";

/**
 * Picker only: the people on this tablet who have a PIN. Names and avatars,
 * nothing else — no points, no emails, no chore data.
 */
async function GET(request: NextRequest) {
  try {
    const picker = await verifyPicker(request);
    if (!picker) return NextResponse.json({ error: "Tablet not enrolled" }, { status: 401 });

    const db = getDb();
    const household = (await db
      .prepare(`select id, name from households where id = ?`)
      .get(picker.householdId)) as { id: string; name: string } | undefined;
    if (!household) return NextResponse.json({ error: "Household not found" }, { status: 404 });

    const profiles = (await db
      .prepare(
        `select u.id, u.name, u.avatar_url
           from memberships m
           join users u on u.id = m.user_id
          where m.household_id = ? and u.pin_hash is not null
          order by m.joined_at asc`,
      )
      .all(picker.householdId)) as { id: string; name: string; avatar_url: string | null }[];

    return noCache(
      NextResponse.json({
        household: { id: household.id, name: household.name },
        profiles: profiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          avatarUrl: profile.avatar_url,
        })),
      }),
    );
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Profiles GET failed");
    return NextResponse.json({ error: "Failed to load profiles" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
