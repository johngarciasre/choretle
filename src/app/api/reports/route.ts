import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { error } from "@/lib/logger";

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

    const user = await db.select().from(schema.users).where(eq(schema.users.id, payload.userId)).first();
    if (!user) {
      return { error: "User not found" };
    }

    return { userId: payload.userId, familyId: payload.familyId || user.familyId };
  } catch (error) {
    error({ err: error }, "Token verification failed");
    return { error: "Invalid token" };
  }
}

// ─── Simple Report Generation ──────────────────────────────────────
async function getDailyReport(userId: string, familyId?: string) {
  const db = await initDb();
  if (!db) throw new Error("Database not initialized");

  // Get open jobs for user
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

async function getDoneReport(familyId?: string) {
  return {
    type: "done",
    dateRange: { start: "", end: "" },
    jobsCompleted: [],
    totalPointsEarned: 0,
  };
}

async function getTaskReport(userId: string, familyId?: string) {
  return {
    type: "task",
    tasks: [],
    completionHistory: [],
  };
}

async function getMemberReport(familyId?: string) {
  return {
    type: "member",
    members: [],
    totalMembers: 0,
  };
}

async function getWallboardReport(familyId?: string) {
  return {
    type: "wallboard",
    slates: [],
    totalOpenJobs: 0,
    lastUpdated: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
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
        report = await getDoneReport(familyId);
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
  } catch (error) {
    error({ err: error }, "Reports GET failed");
    if (error instanceof Error && error.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}
