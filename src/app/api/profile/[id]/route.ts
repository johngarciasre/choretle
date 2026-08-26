import { NextRequest, NextResponse } from "next/server";
import * as schema from "@/db/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { initDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";

// ─── Simple Auth Verification ──────────────────────────────────────
async function verifyAuth(request: NextRequest): Promise<{ userId: string; familyId?: string } | { error: string }> {
  const cookie = request.cookies.get("auth-token")?.value;
  if (!cookie) {
    return { error: "No token provided" };
  }

  try {
    const parts = cookie.split(".");
    if (parts.length !== 3) {
      return { error: "Invalid token format" };
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return { error: "Token expired" };
    }

    const db = await initDb();
    if (!db) {
      return { error: "Database not initialized" };
    }

    const user = (await db.select().from(schema.users).where(eq(schema.users.id, payload.userId)).limit(1))[0];
    if (!user) {
      return { error: "User not found" };
    }

    return { userId: payload.userId, familyId: payload.familyId || user.familyId };
  } catch (err) {
    error({ err }, "Token verification failed");
    return { error: "Invalid token" };
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsedParams = await params;
    const profileUserId = parsedParams.id;

    // Verify auth
    const authResult = await verifyAuth(request);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Fetch user profile
    const userRow = (await db.select().from(schema.users).where(eq(schema.users.id, profileUserId)).limit(1))[0];
    if (!userRow) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check family access — only allow viewing profiles within the same family
    if (authResult.familyId && userRow.familyId !== authResult.familyId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Fetch completed jobs with category info
    const completions = await db.select({
      job: schema.jobs,
      slateTask: schema.slateTasks,
      task: schema.tasks,
      slate: schema.slates,
    })
      .from(schema.jobs)
      .leftJoin(schema.slateTasks, eq(schema.jobs.slateTaskId, schema.slateTasks.id))
      .leftJoin(schema.tasks, eq(schema.slateTasks.taskId, schema.tasks.id))
      .leftJoin(schema.slates, eq(schema.slateTasks.slateId, schema.slates.id))
      .where(
        and(
          eq(schema.jobs.assignedTo, profileUserId),
          eq(schema.jobs.status, "done"),
          sql`${schema.jobs.completedAt} IS NOT NULL`
        )
      )
      .orderBy(desc(schema.jobs.completedAt))
      .limit(50);

    // Calculate stats
    const completedJobs = (completions as any[]).filter((c: any) => c.job.status === "done");
    const totalPoints = completedJobs.reduce((sum: number, j: any) => sum + (j.job.points || 0), 0);
    const jobsCompleted = completedJobs.length;
    const averagePointsPerJob = jobsCompleted > 0 ? totalPoints / jobsCompleted : 0;

    // Calculate weekly stats
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const lastWeekEnd = new Date(startOfWeek);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
    const lastWeekStart = new Date(lastWeekEnd);
    lastWeekStart.setDate(lastWeekStart.getDate() - 6);

    const thisWeekJobs = completedJobs.filter((j: any) => {
      const completedAt = new Date(j.job.completedAt);
      return completedAt >= startOfWeek;
    });
    const pointsThisWeek = thisWeekJobs.reduce((sum: number, j: any) => sum + (j.job.points || 0), 0);

    const lastWeekJobs = completedJobs.filter((j: any) => {
      const completedAt = new Date(j.job.completedAt);
      return completedAt >= lastWeekStart && completedAt <= lastWeekEnd;
    });
    const pointsLastWeek = lastWeekJobs.reduce((sum: number, j: any) => sum + (j.job.points || 0), 0);

    // Calculate streak days
    let streakDays = 0;
    if (completedJobs.length > 0) {
      const completedDates = new Set(
        completedJobs.map((j: any) => new Date(j.job.completedAt).toISOString().split("T")[0])
      );
      let checkDate = new Date();
      while (true) {
        const dateStr = checkDate.toISOString().split("T")[0];
        if (completedDates.has(dateStr)) {
          streakDays++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    // Calculate longest streak
    let longestStreak = 0;
    if (completedJobs.length > 0) {
      const sortedDates = Array.from(
        completedJobs
          .map((j: any) => new Date(j.job.completedAt).toISOString().split("T")[0])
          .sort()
      );

      let currentStreak = 1;
      for (let i = 1; i < sortedDates.length; i++) {
        const prevDate = new Date(sortedDates[i - 1]);
        const currDate = new Date(sortedDates[i]);
        const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

        if (diffDays === 1) {
          currentStreak++;
        } else {
          longestStreak = Math.max(longestStreak, currentStreak);
          currentStreak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, currentStreak);
    }

    const stats = {
      totalPoints,
      pointsThisWeek,
      pointsLastWeek,
      jobsCompleted,
      averagePointsPerJob: parseFloat(averagePointsPerJob.toFixed(1)),
      streakDays,
      longestStreak,
    };

    const user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      avatarUrl: userRow.avatarUrl || "",
      role: userRow.role,
      pointsTotal: userRow.pointsTotal || 0,
      createdAt: userRow.createdAt,
    };

    const completionsFormatted = (completions as any[]).map((c: any) => ({
      id: c.job.id,
      name: c.task?.name || c.slate?.name || "Unknown Task",
      points: c.job.points || 0,
      completedAt: c.job.completedAt,
      category: c.slate?.name || c.task?.archtype || "Other",
    }));

    return NextResponse.json({ user, stats, completions: completionsFormatted });
  } catch (err) {
    error({ err }, "Profile GET failed");
    if (err instanceof Error && err.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
