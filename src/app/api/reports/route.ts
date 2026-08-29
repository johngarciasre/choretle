import { NextRequest, NextResponse } from "next/server";
import * as schema from "@/db/schema";
import { eq, and, or, sql, desc } from "drizzle-orm";
import { initDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { getLeaderboard, getCompletedJobsByUser, getUserStats } from "@/lib/db/service";
import { verifyAuth } from "@/lib/auth";

// ─── Auth Verification (handles both dev mode and production) ──
async function verifyLocalAuth(request: NextRequest): Promise<{ userId: string; familyId?: string } | { error: string }> {
  const auth = verifyAuth(request);
  if (!auth) {
    return { error: "No token provided" };
  }
  return { userId: auth.userId, familyId: auth.familyId };
}

// ─── Report Generators ──────────────────────────────────────────────

async function getDailyReport(userId: string, familyId?: string) {
  const db = await initDb();
  if (!db) throw new Error("Database not initialized");

  // Get open jobs for user (todo + doing)
  const openJobs = await db.select({
    job: schema.jobs,
    slate: schema.slates,
    user: schema.users,
  }).from(schema.jobs)
    .leftJoin(schema.slates, eq(schema.jobs.slateTaskId, schema.slates.id))
    .leftJoin(schema.users, eq(schema.jobs.assignedTo, schema.users.id))
    .where(
      and(
        or(eq(schema.jobs.status, "todo"), eq(schema.jobs.status, "doing")),
        or(eq(schema.jobs.assignedTo, userId), sql`${schema.jobs.assignedTo} IS NULL`)
      )
    );

  return {
    type: "daily",
    date: new Date().toISOString().split("T")[0],
    jobsCompletedToday: [],
    jobsInProgress: openJobs.filter((j: any) => j.job.status === "doing"),
    jobsTodo: openJobs.filter((j: any) => j.job.status === "todo"),
    totalPointsEarned: 0,
    topOpenJobs: openJobs.slice(0, 3),
  };
}

async function getDoneReport(userId: string, familyId?: string) {
  const db = await initDb();
  if (!db) throw new Error("Database not initialized");

  // Get completed jobs for the user
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
        eq(schema.jobs.assignedTo, userId),
        sql`${schema.jobs.completedAt} IS NOT NULL`
      )
    )
    .orderBy(desc(schema.jobs.completedAt));

  const totalPoints = (completedJobs as any[]).reduce((sum: number, j: any) => sum + (j.job.points || 0), 0);

  return {
    type: "done",
    dateRange: { start: "", end: "" },
    jobsCompleted: completedJobs.map((j: any) => ({
      id: j.job.id,
      name: j.slateTask?.name || j.task?.name || "Unknown Task",
      points: j.job.points || 0,
      completedAt: j.job.completedAt,
    })),
    totalPointsEarned: totalPoints,
  };
}

async function getTaskReport(userId: string, familyId?: string) {
  const db = await initDb();
  if (!db) throw new Error("Database not initialized");

  // Get all tasks for the family and their completion counts
  const tasks = await db.select({
    task: schema.tasks,
    slateTask: schema.slateTasks,
    completedCount: sql<number>`COUNT(CASE WHEN ${schema.jobs.status} = 'done' THEN 1 END)`,
    totalJobs: sql<number>`COUNT(${schema.jobs.id})`,
  })
    .from(schema.tasks)
    .leftJoin(schema.slateTasks, eq(schema.tasks.id, schema.slateTasks.taskId))
    .leftJoin(schema.jobs, and(
      eq(schema.jobs.slateTaskId, schema.slateTasks.id),
      eq(schema.jobs.assignedTo, userId)
    ))
    .where(eq(schema.tasks.familyId, familyId!))
    .groupBy(schema.tasks.id, schema.slateTasks.id);

  return {
    type: "task",
    tasks: (tasks as any[]).map((t: any) => ({
      id: t.task.id,
      name: t.task.name,
      totalPoints: t.task.points || 0,
      completedCount: parseInt(t.completedCount) || 0,
      totalJobs: parseInt(t.totalJobs) || 0,
    })),
    completionHistory: [],
  };
}

async function getMemberReport(familyId?: string) {
  const db = await initDb();
  if (!db) throw new Error("Database not initialized");

  // Get all users in the family with their stats
  const members = await db.select({
    user: schema.users,
    completedCount: sql<number>`COUNT(CASE WHEN ${schema.jobs.status} = 'done' THEN 1 END)`,
    totalPoints: sql<number>`COALESCE(SUM(${schema.jobs.points}), 0)`,
  })
    .from(schema.users)
    .leftJoin(schema.jobs, eq(schema.jobs.assignedTo, schema.users.id))
    .where(eq(schema.users.familyId, familyId!))
    .groupBy(schema.users.id);

  const totalMembers = (members as any[]).length;
  const membersWithStats = (members as any[]).map((m: any) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
    role: m.user.role,
    pointsTotal: m.user.pointsTotal || 0,
    completedJobs: parseInt(m.completedCount) || 0,
    earnedPoints: parseInt(m.totalPoints) || 0,
  }));

  return {
    type: "member",
    members: membersWithStats,
    totalMembers,
  };
}

async function getWallboardReport(familyId?: string) {
  const db = await initDb();
  if (!db) throw new Error("Database not initialized");

  // Get open jobs (todo + doing) for the family
  const openJobs = await db.select({
    job: schema.jobs,
    user: schema.users,
    slate: schema.slates,
  })
    .from(schema.jobs)
    .leftJoin(schema.users, eq(schema.jobs.assignedTo, schema.users.id))
    .leftJoin(schema.slates, eq(schema.jobs.slateTaskId, schema.slates.id))
    .where(
      or(eq(schema.jobs.status, "todo"), eq(schema.jobs.status, "doing"))
    );

  // Get leaderboard for the family
  const leaderboard = await getLeaderboard(familyId!);

  return {
    type: "wallboard",
    slates: (openJobs as any[]).map((j: any) => ({
      id: j.slate?.id,
      name: j.slate?.name,
      openJobs: 1,
    })),
    totalOpenJobs: (openJobs as any[]).length,
    leaderboard: (leaderboard as any[]) || [],
    lastUpdated: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyLocalAuth(request);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { userId, familyId } = authResult;
    const url = new URL(request.url);
    const type = url.searchParams.get("type");

    if (!type) {
      return NextResponse.json({ error: "Report type is required" }, { status: 400 });
    }

    const validTypes = ["daily", "done", "task", "member", "wallboard"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Invalid report type. Must be one of: ${validTypes.join(", ")}` }, { status: 400 });
    }

    let report;
    switch (type) {
      case "daily":
        report = await getDailyReport(userId, familyId);
        break;
      case "done":
        report = await getDoneReport(userId, familyId);
        break;
      case "task":
        report = await getTaskReport(userId, familyId);
        break;
      case "member":
        report = await getMemberReport(familyId);
        break;
      case "wallboard":
        report = await getWallboardReport(familyId);
        break;
    }

    return NextResponse.json(report);
  } catch (err) {
    error({ err }, "Reports GET failed");
    if (err instanceof Error && err.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}
