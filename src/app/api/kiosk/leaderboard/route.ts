import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, verifyPicker } from "@/lib/auth";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { noCache } from "@/lib/http";
import { currentStreakFromDays } from "@/lib/streak";

/**
 * Kiosk payload for an idle tablet: first names, avatars, points and streaks.
 * Readable by a picker session, which is the only reason a lobby screen can
 * show this without handing out any chore data.
 */
function firstName(name: string | null): string {
  const base = (name || "").split("@")[0].trim();
  return base.split(" ")[0] || "Member";
}

export async function GET(request: NextRequest) {
  try {
    const picker = await verifyPicker(request);
    const auth = picker ? null : await verifyAuth(request);
    const householdId = picker?.householdId ?? auth?.householdId;
    if (!householdId) return NextResponse.json({ error: "Not available" }, { status: 401 });

    const db = getDb();
    const household = (await db.prepare(`select name from households where id = ?`).get(householdId)) as
      | { name: string }
      | undefined;

    const members = (await db
      .prepare(
        `select u.id, u.name, u.avatar_url, m.points_total, m.role
           from memberships m
           join users u on u.id = m.user_id
          where m.household_id = ?
          order by m.points_total desc, u.name asc
          limit 12`,
      )
      .all(householdId)) as {
      id: string;
      name: string;
      avatar_url: string | null;
      points_total: number;
      role: string;
    }[];

    const withStreaks = [];
    for (const member of members) {
      const days = (await db
        .prepare(
          `select distinct to_char(j.completed_at, 'YYYY-MM-DD') as day
             from jobs j
            where j.assigned_to = ? and j.status = 'done' and j.completed_at is not null
              and j.completed_at >= now() - interval '60 days'
              and j.list_id in (select id from lists where household_id = ?)`,
        )
        .all(member.id, householdId)) as { day: string }[];
      withStreaks.push({
        // First names only: a kiosk screen is public to anyone in the room, and
        // some seeded display names are email addresses.
        user: { id: member.id, name: firstName(member.name), avatarUrl: member.avatar_url },
        points: member.points_total ?? 0,
        streakDays: currentStreakFromDays(days.map((row) => String(row.day))),
      });
    }

    return noCache(
      NextResponse.json({
        household: { name: household?.name ?? "" },
        updatedAt: new Date().toISOString(),
        members: withStreaks,
      }),
    );
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Kiosk leaderboard failed");
    return NextResponse.json({ error: "Failed to load the leaderboard" }, { status: 500 });
  }
}
