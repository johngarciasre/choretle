import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

async function verifyLocalAuth(request: NextRequest): Promise<{ userId: string; familyId?: string } | { error: string }> {
  const auth = verifyAuth(request);
  if (!auth) return { error: "No token provided" };
  const rawDb = getRawDb();
  if (!rawDb) return { error: "Database not initialized" };
  try {
    const user = rawDb.prepare(`SELECT id, family_id FROM users WHERE id = ?`).get(auth.userId);
    if (!user) return { error: "User not found" };
    return { userId: auth.userId, familyId: (auth.familyId || (user as any).family_id || undefined) };
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Token verification failed");
    return { error: "Invalid token" };
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const parsedParams = await params;
    const jobId = parsedParams.jobId;
    const authResult = await verifyLocalAuth(request);
    if ("error" in authResult) return NextResponse.json({ error: authResult.error }, { status: 401 });
    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const job = rawDb.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as any;
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    if ((job as any).list_id) {
      const list = rawDb.prepare(`SELECT * FROM lists WHERE id = ?`).get(job.list_id) as any;
      if (list && list.family_id && list.family_id !== authResult.familyId)
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const taskId = job.slate_task_id || job.slateTaskId;
    const task = rawDb.prepare(`SELECT * FROM tasks WHERE id = ?`).get(taskId) as any;

    const commentsRaw = rawDb.prepare(
      `SELECT c.*, u.name as user_name, u.avatar_url FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.job_id = ? ORDER BY c.created_at DESC`
    ).all(jobId) as any[];

    const historyRaw = rawDb.prepare(
      `SELECT jh.*, u.name as user_name, u.avatar_url FROM job_history jh LEFT JOIN users u ON jh.user_id = u.id WHERE jh.job_id = ? ORDER BY jh.created_at DESC`
    ).all(jobId) as any[];

    return NextResponse.json({
      id: job.id, listId: job.list_id, name: job.name, description: job.description,
      points: job.points || 0, status: job.status,
      assignedTo: job.assigned_to || job.assignedTo,
      slateTaskId: job.slate_task_id || job.slateTaskId,
      completedAt: job.completed_at ? new Date(job.completed_at).toISOString() : null,
      task: task ? { id: task.id, name: task.name, description: task.description, points: task.points } : null,
      comments: (commentsRaw || []).map((c: any) => ({
        id: c.id, content: c.content, userId: c.user_id, userName: c.user_name,
        avatarUrl: c.avatar_url, createdAt: c.created_at ? new Date(c.created_at).toISOString() : new Date().toISOString(),
      })),
      jobHistory: (historyRaw || []).map((h: any) => ({
        id: h.id, action: h.action, details: h.details, userId: h.user_id,
        userName: h.user_name, avatarUrl: h.avatar_url,
        createdAt: h.created_at ? new Date(h.created_at).toISOString() : new Date().toISOString(),
      })),
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Job GET failed");
    return NextResponse.json({ error: "Failed to fetch job" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const parsedParams = await params;
    const jobId = parsedParams.jobId;
    const authResult = await verifyLocalAuth(request);
    if ("error" in authResult) return NextResponse.json({ error: authResult.error }, { status: 401 });
    const body = await request.json();
    const { status, assignedTo } = body;
    if (!status) return NextResponse.json({ error: "Status is required" }, { status: 400 });
    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const job = rawDb.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as any;
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    if ((job as any).list_id) {
      const list = rawDb.prepare(`SELECT * FROM lists WHERE id = ?`).get(job.list_id) as any;
      if (list && list.family_id && list.family_id !== authResult.familyId)
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const now = new Date().toISOString();
    let completedAt: string | null = null;
    if (status === "done" && job.status !== "done") completedAt = now;

    const updateFields: string[] = ["status = ?", "updated_at = ?"];
    const updateValues: any[] = [status, now];
    if (assignedTo) { updateFields.push("assigned_to = ?"); updateValues.push(assignedTo); }
    if (completedAt) { updateFields.push("completed_at = ?"); updateValues.push(completedAt); }
    updateValues.push(jobId);
    rawDb.prepare(`UPDATE jobs SET ${updateFields.join(", ")} WHERE id = ?`).run(...updateValues);

    const updatedJob = rawDb.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as any;

    if (status !== job.status) {
      const historyId = `jh-${Date.now()}`;
      rawDb.prepare(
        `INSERT INTO job_history (id, job_id, action, details, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(historyId, jobId, `status_${job.status}_to_${status}`, `Status changed from ${job.status} to ${status}`, authResult.userId, now);

      if (status === "done") {
        try {
          const totalPoints = updatedJob.points || 0;
          if (updatedJob.assigned_to) {
            rawDb.prepare(`UPDATE users SET points_total = points_total + ? WHERE id = ?`).run(totalPoints, updatedJob.assigned_to);
          }
          if (updatedJob.slate_task_id || updatedJob.slateTaskId) {
            const slateTaskId = updatedJob.slate_task_id || updatedJob.slateTaskId;
            rawDb.prepare(`UPDATE tasks SET completed_count = COALESCE(completed_count, 0) + 1 WHERE id = ?`).run(slateTaskId);
          }
        } catch (historyErr) {
          error({ err: historyErr }, "Failed to create job history");
        }
      }
    }

    return NextResponse.json({
      success: true,
      job: { id: updatedJob.id, listId: updatedJob.list_id, name: updatedJob.name, description: updatedJob.description,
        points: updatedJob.points || 0, status: updatedJob.status,
        assignedTo: updatedJob.assigned_to || updatedJob.assignedTo,
        slateTaskId: updatedJob.slate_task_id || updatedJob.slateTaskId,
        completedAt: updatedJob.completed_at ? new Date(updatedJob.completed_at).toISOString() : null },
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Job PUT failed");
    return NextResponse.json({ error: "Failed to update job status" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const parsedParams = await params;
    const jobId = parsedParams.jobId;
    const authResult = await verifyLocalAuth(request);
    if ("error" in authResult) return NextResponse.json({ error: authResult.error }, { status: 401 });
    const body = await request.json();
    const { content } = body;
    if (!content || typeof content !== "string" || !content.trim())
      return NextResponse.json({ error: "Comment content is required" }, { status: 400 });
    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const job = rawDb.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as any;
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    if ((job as any).list_id) {
      const list = rawDb.prepare(`SELECT * FROM lists WHERE id = ?`).get(job.list_id) as any;
      if (list && list.family_id && list.family_id !== authResult.familyId)
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const now = new Date().toISOString();
    const commentId = `cmt-${Date.now()}`;
    rawDb.prepare(
      `INSERT INTO comments (id, job_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(commentId, jobId, authResult.userId, content.trim(), now);

    const user = rawDb.prepare(`SELECT name FROM users WHERE id = ?`).get(authResult.userId) as any;
    return NextResponse.json({
      success: true,
      comment: { id: commentId, content: content.trim(), userId: authResult.userId,
        userName: user?.name || "Anonymous", createdAt: now },
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Job POST comment failed");
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
  }
}
