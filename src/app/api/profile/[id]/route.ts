import { NextRequest, NextResponse } from "next/server";
import * as schema from "@/db/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { initDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

// ─── Auth Verification (handles both dev mode and production) ──
async function verifyLocalAuth(request: NextRequest): Promise<{ userId: string; familyId?: string } | { error: string }> {
  const auth = verifyAuth(request);
  if (!auth) {
    return { error: "No token provided" };
  }
  return { userId: auth.userId, familyId: auth.familyId };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await verifyLocalAuth(request);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { userId, familyId } = authResult;
    const resolvedUserId = (await params).id;
    const targetUserId = resolvedUserId === "me" ? userId : resolvedUserId;

    const db = await initDb();
    if (!db) {
      throw new Error("Database not initialized");
    }

    // Get user profile data
    const userProfileRows = await db.select().from(schema.users).where(eq(schema.users.id, targetUserId)).limit(1);
    const userProfile = userProfileRows[0];

    if (!userProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user belongs to the same family as authenticated user
    if (userProfile.familyId !== familyId && userProfile.id !== userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get completed jobs for this user
    const completedJobs = await db.select({
      job: schema.jobs,
      task: schema.tasks,
      slateTask: schema.slateTasks,
    })
      .from(schema.jobs)
      .leftJoin(schema.slateTasks, eq(schema.jobs.slateTaskId, schema.slateTasks.id))
      .leftJoin(schema.tasks, eq(schema.slateTasks.taskId, schema.tasks.id))
      .where(
        and(
          eq(schema.jobs.status, "done"),
          eq(schema.jobs.assignedTo, targetUserId),
          sql`${schema.jobs.completedAt} IS NOT NULL`
        )
      )
      .orderBy(desc(schema.jobs.completedAt));

    // Get streaks for this user
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recentJobs = await db.select({
      job: schema.jobs,
      task: schema.tasks,
    })
      .from(schema.jobs)
      .leftJoin(schema.tasks, eq(schema.jobs.slateTaskId, schema.tasks.id))
      .where(
        and(
          eq(schema.jobs.status, "done"),
          eq(schema.jobs.assignedTo, targetUserId),
          gte(schema.jobs.completedAt, thirtyDaysAgo.toISOString())
        )
      )
      .orderBy(desc(schema.jobs.completedAt));

    // Calculate streaks
    let currentStreak = 0;
    let longestStreak = 0;
    const doneDates = new Set<string>();

    for (const job of recentJobs as any[]) {
      if (job.job.completedAt) {
        const dateStr = job.job.completedAt.split("T")[0];
        if (!doneDates.has(dateStr)) {
          doneDates.add(dateStr);
        }
      }
    }

    // Calculate streaks by iterating backwards from today
    const sortedDates = Array.from(doneDates).sort().reverse();
    let streakStart = 0;

    for (let i = 0; i < sortedDates.length; i++) {
      const current = new Date(sortedDates[i]);
      const expected = new Date(current.getTime() + streakStart * 24 * 60 * 60 * 1000);
      if (current.toISOString().split("T")[0] === expected.toISOString().split("T")[0]) {
        streakStart++;
      } else {
        break;
      }
    }

    currentStreak = streakStart;
    longestStreak = Math.max(currentStreak, longestStreak);

    // Calculate total points and average
    const totalPoints = (recentJobs as any[]).reduce((sum: number, j: any) => sum + (j.job.points || 0), 0);
    const averagePointsPerJob = recentJobs.length > 0 ? totalPoints / recentJobs.length : 0;

    // Get stats for the last 7 days
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const dailyStats = await db.select({
      date: sql<string>`DATE(${schema.jobs.completedAt})`,
      points: sql<number>`COALESCE(SUM(${schema.jobs.points}), 0)`,
    })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.status, "done"),
          eq(schema.jobs.assignedTo, targetUserId),
          gte(schema.jobs.completedAt, sevenDaysAgo.toISOString())
        )
      )
      .groupBy(sql`DATE(${schema.jobs.completedAt})`);

    // Build 7-day array with all days (including zero-point days)
    const last7Days: { date: string; points: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split("T")[0];
      const dayData = (dailyStats as any[]).find((d: any) => d.date === dateStr);
      last7Days.push({
        date: dateStr,
        points: dayData ? parseInt(dayData.points) : 0,
      });
    }

    const maxDayPoints = Math.max(...last7Days.map(d => d.points), 1);

    return NextResponse.json({
      user: {
        id: userProfile.id,
        email: userProfile.email,
        name: userProfile.name,
        role: userProfile.role,
        avatarUrl: userProfile.avatarUrl,
        familyId: userProfile.familyId,
        pointsTotal: userProfile.pointsTotal || 0,
        createdAt: userProfile.createdAt,
      },
      stats: {
        totalPoints,
        jobsCompleted: recentJobs.length,
        averagePointsPerJob,
        longestStreak,
        dailyStats: last7Days,
        maxDayPoints,
      },
    });
  } catch (err) {
    error({ err }, "Profile GET failed");
    if (err instanceof Error && err.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
