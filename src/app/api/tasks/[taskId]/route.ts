import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

// ─── Middleware: Verify Auth Token ──────────────────────────────────
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

    // Ensure DB is initialized to validate user exists
    const db = await initDb();
    if (!db) {
      return { error: "Database not initialized" };
    }

    const user = await db.select().from(schema.users).where(eq(schema.users.id, payload.userId)).first();
    if (!user) {
      return { error: "User not found" };
    }

    return { userId: payload.userId, familyId: payload.familyId || undefined };
  } catch (error) {
    console.error("Token verification failed:", error);
    return { error: "Invalid token" };
  }
}

// ─── GET: Fetch task details with history and comments ───────────────
export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const parsedParams = await params;
    const taskId = parsedParams.taskId;

    // Verify auth
    const authResult = await verifyAuth(request);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const db = await initDb();
    if (!db) {
      throw new Error("Database not initialized");
    }

    // Fetch task
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).first();
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Check family access
    if (task.familyId && task.familyId !== authResult.familyId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Fetch associated jobs for this task
    const jobs = await db.select().from(schema.jobs).where(
      eq(schema.jobs.slateTaskId, taskId)
    ).orderBy(desc(schema.jobs.createdAt));

    // Fetch comments
    const comments = await db.select({
      comment: schema.comments,
      user: schema.users,
    }).from(schema.comments)
      .leftJoin(schema.users, eq(schema.comments.userId, schema.users.id))
      .where(eq(schema.comments.jobId, sql`${schema.jobs.id}`))
      .orderBy(desc(schema.comments.createdAt));

    // Fetch job history for this specific task (slateTaskId)
    const jobHistory = await db.select().from(schema.jobHistory).where(
      eq(schema.jobHistory.jobId, taskId)
    ).orderBy(desc(schema.jobHistory.createdAt));

    // Build response with all jobs
    const responseJobs = jobs.map((job: any) => ({
      id: job.id,
      name: job.name,
      description: job.description || task.description || "",
      points: job.points || task.points || 0,
      status: job.status,
      assignedTo: job.assignedTo,
      dueDate: job.dueDate,
      completedAt: job.completedAt,
      createdAt: job.createdAt ? new Date(job.createdAt).toISOString() : "",
      updatedAt: job.updatedAt ? new Date(job.updatedAt).toISOString() : "",
    }));

    // Build comments grouped by job
    const commentsByJob = new Map<string, any[]>();
    for (const { comment, user } of comments) {
      if (!commentsByJob.has(comment.jobId)) {
        commentsByJob.set(comment.jobId, []);
      }
      commentsByJob.get(comment.jobId)?.push({
        id: comment.id,
        content: comment.content,
        userId: user?.id || null,
        userName: user?.name || "Anonymous",
        createdAt: comment.createdAt ? new Date(comment.createdAt).toISOString() : "",
      });
    }

    return NextResponse.json({
      task: {
        id: task.id,
        name: task.name,
        description: task.description || "",
        points: task.points || 0,
        icon: task.icon,
        archtype: task.archtype,
        isActive: task.isActive,
        familyId: task.familyId,
      },
      jobs: responseJobs,
      comments: Array.from(commentsByJob.entries()).map(([jobId, comments]) => ({
        jobId,
        comments,
      })),
      jobHistory,
    });
  } catch (error) {
    console.error("Task GET failed:", error);
    if (error instanceof Error && error.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}

// ─── POST: Add comment to a job ─────────────────────────────────────
export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const parsedParams = await params;
    const taskId = parsedParams.taskId;

    // Verify auth
    const authResult = await verifyAuth(request);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const body = await request.json();
    const { content, jobId } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Comment content is required" }, { status: 400 });
    }

    // If no jobId provided, use the first job for this task
    const db = await initDb();
    if (!db) {
      throw new Error("Database not initialized");
    }

    let targetJobId = jobId;
    
    if (targetJobId && !/^[\da-f\-]{36}$/.test(targetJobId)) {
      // Validate UUID format
      return NextResponse.json({ error: "Invalid job ID format" }, { status: 400 });
    }

    // If jobId not provided, find a job for this task
    if (!targetJobId) {
      const jobs = await db.select().from(schema.jobs).where(eq(schema.jobs.slateTaskId, taskId)).first();
      if (jobs) {
        targetJobId = jobs.id;
      } else {
        return NextResponse.json({ error: "No job found for this task" }, { status: 404 });
      }
    }

    // Create comment
    const comment = await db.insert(schema.comments).values({
      jobId: targetJobId,
      userId: authResult.userId,
      content,
    }).returning("*");

    return NextResponse.json({
      success: true,
      comment: comment[0],
    });
  } catch (error) {
    console.error("Task POST failed:", error);
    if (error instanceof Error && error.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
}
