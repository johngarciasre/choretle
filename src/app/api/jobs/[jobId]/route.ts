import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";
import { canTransition } from "@/lib/jobStatus";

async function verifyLocalAuth(request: NextRequest): Promise<{ userId: string; familyId?: string; role: string } | { error: string }> {
  const auth = await verifyAuth(request);
  if (!auth) return { error: "No token provided" };
  const rawDb = getRawDb();
  if (!rawDb) return { error: "Database not initialized" };
  try {
    const user = rawDb.prepare(`SELECT id, family_id, role FROM users WHERE id = ?`).get(auth.userId);
    if (!user) return { error: "User not found" };
    return {
      userId: auth.userId,
      familyId: (auth.familyId || (user as any).family_id || undefined),
      role: (user as any).role || auth.role || "child",
    };
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Token verification failed");
    return { error: "Invalid token" };
  }
}

/** DB rows are snake_case; the job API contract is camelCase. */
function serializeJob(job: any) {
  return {
    id: job.id, listId: job.list_id, name: job.name, description: job.description,
    points: job.points || 0, status: job.status,
    assignedTo: job.assigned_to || job.assignedTo,
    slateTaskId: job.slate_task_id || job.slateTaskId,
    completedAt: job.completed_at ? new Date(job.completed_at).toISOString() : null,
    dueDate: job.due_date || null,
    verifyRequired: !!job.verify_required,
    reviewedAt: job.reviewed_at ? new Date(job.reviewed_at).toISOString() : null,
  };
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

    const jobList = rawDb.prepare(`SELECT family_id FROM lists WHERE id = ?`).get(job.list_id) as any;
    if (!jobList || jobList.family_id !== authResult.familyId)
      return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const task = rawDb.prepare(
      `SELECT t.* FROM slate_tasks st JOIN tasks t ON t.id = st.task_id WHERE st.id = ?`
    ).get(job.slate_task_id) as any;

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
      dueDate: job.due_date || null,
      verifyRequired: !!job.verify_required,
      reviewedAt: job.reviewed_at ? new Date(job.reviewed_at).toISOString() : null,
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
    const { status, assignedTo, claim } = body;
    if (!claim && !status) return NextResponse.json({ error: "Status is required" }, { status: 400 });
    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const job = rawDb.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as any;
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const jobList = rawDb.prepare(`SELECT family_id FROM lists WHERE id = ?`).get(job.list_id) as any;
    if (!jobList || jobList.family_id !== authResult.familyId)
      return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const now = new Date().toISOString();

    // Grabbing an unassigned chore: the WHERE clause keeps the check and the
    // write in one step, so two kids racing for it cannot both win.
    if (claim) {
      const claimed = rawDb.prepare(
        `UPDATE jobs SET assigned_to = ?, updated_at = ? WHERE id = ? AND assigned_to IS NULL AND status = 'todo'`
      ).run(authResult.userId, now, jobId);
      if (claimed.changes === 0) {
        return NextResponse.json({ error: "This chore has already been grabbed." }, { status: 409 });
      }
      rawDb.prepare(
        `INSERT INTO job_history (id, job_id, action, details, user_id, created_at) VALUES (?, ?, 'claimed', ?, ?, ?)`
      ).run(`jh-${crypto.randomUUID()}`, jobId, "Grabbed from the open pool", authResult.userId, now);
      const grabbed = rawDb.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as any;
      return NextResponse.json({ success: true, job: serializeJob(grabbed) });
    }

    if (!canTransition(job.status, status)) {
      return NextResponse.json(
        { error: `Invalid status change from "${job.status}" to "${status}"` },
        { status: 400 },
      );
    }

    // Chores that need verification can only be closed by a parent.
    const isReviewer = authResult.role === "parent" || authResult.role === "admin";
    if (status === "done" && job.verify_required && !isReviewer) {
      return NextResponse.json(
        { error: "This chore needs a parent to approve it before it can be marked done." },
        { status: 403 },
      );
    }

    // completed_at is set once, when the job first reaches done, and is never
    // cleared afterwards because done is terminal. Points are only awarded on
    // that first transition, so a job can never pay out twice.
    const firstCompletion = status === "done" && !job.completed_at;
    const needsReviewStamp = status === "done" && job.verify_required && !job.reviewed_at;

    const updateFields: string[] = ["status = ?", "updated_at = ?"];
    const updateValues: any[] = [status, now];
    if (assignedTo) { updateFields.push("assigned_to = ?"); updateValues.push(assignedTo); }
    if (firstCompletion) { updateFields.push("completed_at = ?"); updateValues.push(now); }
    if (needsReviewStamp) { updateFields.push("reviewed_at = ?"); updateValues.push(now); }
    updateValues.push(jobId);
    rawDb.prepare(`UPDATE jobs SET ${updateFields.join(", ")} WHERE id = ?`).run(...updateValues);

    const updatedJob = rawDb.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as any;

    if (status !== job.status) {
      rawDb.prepare(
        `INSERT INTO job_history (id, job_id, action, details, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(`jh-${crypto.randomUUID()}`, jobId, `status_${job.status}_to_${status}`, `Status changed from ${job.status} to ${status}`, authResult.userId, now);

      if (firstCompletion && updatedJob.assigned_to) {
        rawDb.prepare(`UPDATE users SET points_total = points_total + ? WHERE id = ?`)
          .run(updatedJob.points || 0, updatedJob.assigned_to);
      }
    }

    return NextResponse.json({
      success: true,
      job: serializeJob(updatedJob),
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

    const jobList = rawDb.prepare(`SELECT family_id FROM lists WHERE id = ?`).get(job.list_id) as any;
    if (!jobList || jobList.family_id !== authResult.familyId)
      return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const now = new Date().toISOString();
    const commentId = `cmt-${crypto.randomUUID()}`;
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
