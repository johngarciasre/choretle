import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { isRestrictedSession, verifyAuth } from "@/lib/auth";
import { currentStreakFromDays } from "@/lib/streak";

async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const targetUserId = (await params).id;

    // Verify user belongs to household
    const userProfileRows = await rawDb.prepare(`SELECT u.id, u.name, u.email, u.avatar_url, u.created_at, m.role, m.points_total FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.user_id = ? AND m.household_id = ?`).get(targetUserId, householdId) as any;
    if (!userProfileRows) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Fetch completed jobs with task info (jobs.slate_task_id -> slate_tasks -> tasks)
    const completedJobs = await rawDb.prepare(
      `SELECT j.*, t.name as task_name, t.points as task_points
       FROM jobs j
       LEFT JOIN slate_tasks st ON j.slate_task_id = st.id
       LEFT JOIN tasks t ON st.task_id = t.id
       WHERE j.assigned_to = ? AND j.status = 'done' AND j.list_id IN (SELECT id FROM lists WHERE household_id = ?)
       ORDER BY j.completed_at DESC LIMIT 50`
    ).all(targetUserId, householdId) as any[];

    // Fetch recent jobs (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentJobs = await rawDb.prepare(
      `SELECT j.*, t.name as task_name
       FROM jobs j
       LEFT JOIN slate_tasks st ON j.slate_task_id = st.id
       LEFT JOIN tasks t ON st.task_id = t.id
       WHERE j.assigned_to = ? AND j.created_at >= ? AND j.list_id IN (SELECT id FROM lists WHERE household_id = ?)
       ORDER BY j.created_at DESC LIMIT 20`
    ).all(targetUserId, thirtyDaysAgo.toISOString(), householdId) as any[];

    const dayRows = await rawDb.prepare(
      `SELECT DISTINCT to_char(j.completed_at, 'YYYY-MM-DD') as day
       FROM jobs j
       WHERE j.assigned_to = ? AND j.status = 'done' AND j.completed_at IS NOT NULL
         AND j.list_id IN (SELECT id FROM lists WHERE household_id = ?)`
    ).all(targetUserId, householdId) as any[];
    const streakCount = currentStreakFromDays((dayRows || []).map((r: any) => String(r.day)));

    // Fetch daily stats for the last 7 days
    const dailyStats: any[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const dateStr = day.toISOString().split("T")[0];
      const stats = await rawDb.prepare(
        `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
         FROM jobs WHERE assigned_to = ? AND created_at::date = ?::date AND list_id IN (SELECT id FROM lists WHERE household_id = ?)`
      ).get(targetUserId, dateStr, householdId) as any;
      dailyStats.push({ date: dateStr, total: stats?.total || 0, done: stats?.done || 0 });
    }

    return NextResponse.json({
      user: {
        id: userProfileRows.id,
        name: userProfileRows.name,
        email: isRestrictedSession(auth) ? null : userProfileRows.email,
        role: userProfileRows.role,
        avatarUrl: userProfileRows.avatar_url,
        pointsTotal: userProfileRows.points_total || 0,
        createdAt: userProfileRows.created_at,
        streakCount,
      },
      completedJobs: (completedJobs || []).map((j: any) => ({
        id: j.id, name: j.name, status: j.status, taskName: j.task_name,
        // Points actually awarded for this job, not the task template's value.
        points: j.points || 0, completedAt: j.completed_at,
      })),
      recentJobs: (recentJobs || []).map((j: any) => ({
        id: j.id, name: j.name, status: j.status, taskName: j.task_name,
        createdAt: j.created_at,
      })),
      dailyStats,
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Profile GET failed");
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

/** Uploaded photos arrive as data URLs; cap them so a member list stays small. */
const MAX_AVATAR_DATA_URL = 400_000;
const UPLOAD_PREFIXES = ["data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,"];
/** Bundled portraits. Anything else, including off-site links, is refused: an
 *  avatar must never point at a publicly viewable image. */
const INTERNAL_AVATAR_PATTERN = /^\/api\/avatars\/[a-z0-9-]+\.(jpg|png|webp)$/;

/** undefined = invalid, null = clear the photo. */
function normalizeAvatarUrl(input: unknown): string | null | undefined {
  if (input === null) return null;
  if (typeof input !== "string") return undefined;
  const value = input.trim();
  if (!value) return null;
  if (value.startsWith("data:")) {
    const prefix = UPLOAD_PREFIXES.find((p) => value.startsWith(p));
    return prefix && value.length <= MAX_AVATAR_DATA_URL ? value : undefined;
  }
  return INTERNAL_AVATAR_PATTERN.test(value) ? value : undefined;
}

/** Set or clear a member's profile picture. Self-service, plus parents for their kids. */
async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const householdId = auth.householdId;
    if (!householdId) return NextResponse.json({ error: "Household ID required" }, { status: 400 });

    const targetUserId = (await params).id;
    if (targetUserId !== auth.userId && auth.role !== "parent") {
      return NextResponse.json({ error: "You can only change your own photo" }, { status: 403 });
    }

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const target = await rawDb.prepare(`SELECT user_id FROM memberships WHERE user_id = ? AND household_id = ?`).get(targetUserId, householdId) as any;
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const avatarUrl = normalizeAvatarUrl(body?.avatarUrl);
    if (avatarUrl === undefined) {
      return NextResponse.json({ error: "avatarUrl must be an uploaded image, a bundled portrait, or null" }, { status: 400 });
    }

    await rawDb.prepare(`UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?`)
      .run(avatarUrl, new Date().toISOString(), targetUserId);

    return NextResponse.json({ success: true, user: { id: targetUserId, avatarUrl } });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Profile PUT failed");
    return NextResponse.json({ error: "Failed to update profile photo" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
const PUT_impl = withTenant(PUT);
export { PUT_impl as PUT };
