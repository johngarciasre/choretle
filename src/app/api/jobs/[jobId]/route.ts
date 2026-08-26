import { NextRequest, NextResponse } from "next/server";
import { initDb, rawInsert } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and, desc, sql, gt } from "drizzle-orm";
import { error } from "@/lib/logger.server";

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

    const user = (await db.select().from(schema.users).where(eq(schema.users.id, payload.userId)).limit(1))[0];
    if (!user) {
      return { error: "User not found" };
    }

    return { userId: payload.userId, familyId: payload.familyId || undefined };
  } catch (error) {
    error({ err: error }, "Token verification failed");
    return { error: "Invalid token" };
  }
}

// ─── GET: Fetch job details with workflow controls ───────────────────
export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const parsedParams = await params;
    const jobId = parsedParams.jobId;

    // Verify auth
    const authResult = await verifyAuth(request);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const db = await initDb();
    if (!db) {
      throw new Error("Database not initialized");
    }

    // Fetch job
    const job = (await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).limit(1))[0];
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Check family access (jobs are accessed via slate/tasks which belong to families)
    if ((job as any).listId) {
      const list = (await db.select().from(schema.lists).where(eq(schema.lists.id, job.listId)).limit(1))[0];
      if (list && list.familyId && list.familyId !== authResult.familyId) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    // Fetch associated task info (truncated for job view)
    const task = (await db.select().from(schema.tasks).where(eq(schema.tasks.id, job.slateTaskId)).limit(1))[0];

    // Fetch comments
    const comments = await db.select({
      comment: schema.comments,
      user: schema.users,
    }).from(schema.comments)
      .leftJoin(schema.users, eq(schema.comments.userId, schema.users.id))
      .where(eq(schema.comments.jobId, jobId))
      .orderBy(desc(schema.comments.createdAt));

    // Fetch job history
    const jobHistory = await db.select({
      history: schema.jobHistory,
      user: schema.users,
    }).from(schema.jobHistory)
      .leftJoin(schema.users, eq(schema.jobHistory.userId, schema.users.id))
      .where(eq(schema.jobHistory.jobId, jobId))
      .orderBy(desc(schema.jobHistory.createdAt));

    // Get valid next statuses based on current status
    const validNextStatuses = [
      ...(job.status === "todo" ? ["doing"] : []),
      ...(job.status === "doing" ? ["done", "todo", "under_review"] : []),
      ...(job.status === "under_review" ? ["done", "doing"] : []),
      ...(job.status === "done" ? [] : []),
    ];

    return NextResponse.json({
      job: {
        id: job.id,
        name: job.name,
        description: job.description || "",
        points: job.points || 0,
        status: job.status,
        verifyRequired: job.verifyRequired ?? false,
        reviewedAt: job.reviewedAt ? new Date(job.reviewedAt).toISOString() : "",
        assignedTo: job.assignedTo,
        dueDate: job.dueDate ? new Date(job.dueDate).toISOString() : "",
        completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : "",
        createdAt: job.createdAt ? new Date(job.createdAt).toISOString() : "",
        updatedAt: job.updatedAt ? new Date(job.updatedAt).toISOString() : "",
      },
      taskInfo: task ? {
        id: task.id,
        name: task.name,
        description: task.description || "",
        points: task.points || 0,
        icon: task.icon,
        archtype: task.archtype,
        verifyRequired: task.verifyRequired ?? false,
      } : null,
      comments: comments.map(({ comment, user }: { comment: any; user: any }) => ({
        id: comment.id,
        content: comment.content,
        userId: user?.id || null,
        userName: user?.name || "Anonymous",
        createdAt: comment.createdAt ? new Date(comment.createdAt).toISOString() : "",
      })),
      history: jobHistory.map(({ history, user }: { history: any; user: any }) => ({
        id: history.id,
        action: history.action,
        details: history.details || "",
        userId: user?.id || null,
        userName: user?.name || "System",
        createdAt: history.createdAt ? new Date(history.createdAt).toISOString() : "",
      })),
      validNextStatuses,
    });
  } catch (error) {
    error({ err: error }, "Job GET failed");
    if (error instanceof Error && error.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to fetch job" }, { status: 500 });
  }
}

// ─── PUT: Transition job status (todo → doing → done) ───────────────
export async function PUT(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const parsedParams = await params;
    const jobId = parsedParams.jobId;

    // Verify auth
    const authResult = await verifyAuth(request);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const body = await request.json();
    const { status, verifyRequired } = body;

    if (!status || !["todo", "doing", "done", "under_review"].includes(status)) {
      return NextResponse.json({ error: "Invalid status. Must be 'todo', 'doing', 'done', or 'under_review'" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) {
      throw new Error("Database not initialized");
    }

    // Fetch current job
    const job = (await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).limit(1))[0];
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const currentStatus = (job as any).status;

    // Validate transition is allowed
    let validNextStatuses: string[] = [];
    if (currentStatus === "todo") {
      validNextStatuses = ["doing"];
    } else if (currentStatus === "doing") {
      validNextStatuses = ["todo", "done", "under_review"];
    } else if (currentStatus === "under_review") {
      validNextStatuses = ["done", "doing"];
    }
    
    if (!validNextStatuses.includes(status)) {
      return NextResponse.json({ 
        error: `Invalid transition from "${currentStatus}" to "${status}". Valid transitions: ${JSON.stringify(validNextStatuses)}`,
        validNextStatuses
      }, { status: 400 });
    }

    const now = new Date();
    const updateData: Record<string, any> = { status, updatedAt: now };

    if (status === "done") {
      updateData.completedAt = now;
    }
    if (status === "under_review") {
      // Trigger review creation for the family
      const familyId = authResult.familyId;
      if (familyId) {
        await rawInsert("reviews", {
          id: `rev-${Date.now()}`,
          job_id: jobId,
          family_id: familyId,
          reviewer_id: null,
          status: "pending",
          notes: `Job "${job.name}" submitted for review`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Update verifyRequired if provided
    if (verifyRequired !== undefined) {
      updateData.verifyRequired = verifyRequired;
    }

    // Update job
    const updatedJobResult = await db.update(schema.jobs).set(updateData).where(eq(schema.jobs.id, jobId)).returning("*");
    const result = updatedJobResult[0] || null;

    if (result) {
      // Create history entry
      try {
        await rawInsert("job_history", {
          id: `jh-${Date.now()}`,
          job_id: jobId,
          action: "status_change",
          details: `Status changed from "${currentStatus}" to "${status}"`,
          user_id: authResult.userId,
          created_at: new Date().toISOString(),
        });

        // Award points if transitioning to done
        if (status === "done") {
          const totalPoints = (result as any).points || 0;
          
          // Mark all uncompleted subtasks as completed
          await db.update(schema.jobSubtasks)
            .set({ completedAt: now })
            .where(and(eq(schema.jobSubtasks.jobId, jobId), sql`${schema.jobSubtasks.completedAt} IS NULL`));

          // Award points to user if userId provided
          if (authResult.userId && totalPoints > 0) {
            const user = (await db.select().from(schema.users).where(eq(schema.users.id, authResult.userId)).limit(1))[0];
            if (user) {
              const newTotal = ((user as any).pointsTotal || 0) + totalPoints;
              await db.update(schema.users).set({ pointsTotal: newTotal }).where(eq(schema.users.id, authResult.userId));
            }
          }
        }
      } catch (historyErr) {
        error({ err: historyErr }, "Failed to create job history");
      }
    }

    return NextResponse.json({
      success: true,
      job: result,
    });
  } catch (error) {
    error({ err: error }, "Job PUT failed");
    if (error instanceof Error && error.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to update job status" }, { status: 500 });
  }
}
