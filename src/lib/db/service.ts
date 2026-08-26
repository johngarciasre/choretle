import { initDb, rawInsert, rawDeleteWhere, rawUpdate } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { error } from "@/lib/logger.server";

// ─── Global DB Initialization ────────────────────────────────────────

let db: any = null;

async function ensureDb(): Promise<any> {
  if (db) return db;
  db = await initDb();
  return db;
}

function nowISO(): string { return new Date().toISOString(); }

type Insertable<T> = T extends { id: string } ? Omit<T, "id"> : never;
type Selectable<T> = any;

// Import helper functions from jobStatus
import { canTransition, getValidNextStatuses, calculateJobPoints, createJobHistory as _createJobHistory } from "@/lib/jobStatus";

// Re-export for convenience
export { canTransition, getValidNextStatuses, calculateJobPoints };

// ─── Helpers ────────────────────────────────────────────────────────

async function safeQuery<T>(query: Promise<Awaited<T>>): Promise<Awaited<T> | null> {
  try {
    return await query;
  } catch (err) {
    error({ err: err }, "safeQuery failed");
    return null;
  }
}

// ─── Families ───────────────────────────────────────────────────────

export async function getFamilyById(id: string) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    db.select().from(schema.families).where({ id }).limit(1)[0]
  );
  return res as Selectable<any> | null;
}

export async function getFamilyBySlug(slug: string) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    db.select().from(schema.families).where({ slug }).limit(1)[0]
  );
  return res as Selectable<any> | null;
}

export async function createFamily(data: Insertable<any>) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    rawInsert("families", { ...data, id: `family-${Date.now()}`, created_at: nowISO(), updated_at: nowISO() })
  );
  return res || null;
}

export async function updateFamily(id: string, data: Partial<any>) {
  const db = await ensureDb();
  if (!db) return null;
  return rawUpdate("families", data, "id", id) || null;
}

// ─── Users ──────────────────────────────────────────────────────────

export async function getUserById(id: string) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    db.select().from(schema.users).where({ id }).limit(1)[0]
  );
  return res as Selectable<any> | null;
}

export async function getUserByEmail(email: string) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    db.select().from(schema.users).where({ email }).limit(1)[0]
  );
  return res as Selectable<any> | null;
}

export async function updateUserPoints(id: string, points: number) {
  const db = await ensureDb();
  if (!db) return null;
  return rawUpdate("users", { pointsTotal: points }, "id", id) || null;
}

// ─── Profile ────────────────────────────────────────────────────────

export async function getProfileByUserId(userId: string) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    db.select().from(schema.users).where({ id: userId }).limit(1)[0]
  );
  return res as Selectable<any> | null;
}

export async function getCompletedJobsByUser(userId: string, limit = 20) {
  const db = await ensureDb();
  if (!db) return [];
  
  const result = await safeQuery(
    db.select({
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
          eq(schema.jobs.assignedTo, userId)
        )
      )
      .orderBy(desc(schema.jobs.completedAt))
      .limit(limit)
  );
  
  return (result as any[]) || [];
}

// ─── Tags ───────────────────────────────────────────────────────────

// ─── Teams ──────────────────────────────────────────────────────────

export async function getTeamsByFamily(familyId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.teams).where({ familyId })
  );
  return (res as any[]) || [];
}

export async function createTeam(data: Insertable<any>) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    rawInsert("teams", { ...data, id: `team-${Date.now()}`, created_at: nowISO() })
  );
  return res || null;
}

// ─── Tasks ──────────────────────────────────────────────────────────

export async function getTasksByFamily(familyId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.tasks).where({ familyId })
  );
  return (res as any[]) || [];
}

export async function getTaskById(id: string) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    db.select().from(schema.tasks).where({ id }).limit(1)[0]
  );
  return res as Selectable<any> | null;
}

export async function createTask(data: Insertable<any>) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    rawInsert("tasks", { ...data, id: `task-${Date.now()}`, created_at: nowISO(), updated_at: nowISO() })
  );
  return res || null;
}

export async function updateTask(id: string, data: Partial<any>) {
  const db = await ensureDb();
  if (!db) return null;
  return rawUpdate("tasks", data, "id", id) || null;
}

export async function deleteTask(id: string) {
  const db = await ensureDb();
  if (!db) return false;
  await safeQuery(rawDeleteWhere("tasks", [{ col: "id", val: id }]));
  return true;
}

// ─── Subtasks ───────────────────────────────────────────────────────

export async function getSubtasksByTask(taskId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.subtasks).where({ taskId })
  );
  return (res as any[]) || [];
}

export async function createSubtask(data: Insertable<any>) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    rawInsert("subtasks", { ...data, id: `stask-${Date.now()}`, created_at: nowISO(), updated_at: nowISO() })
  );
  return res || null;
}

// ─── Slates ─────────────────────────────────────────────────────────

export async function getSlatesByFamily(familyId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.slates).where({ familyId })
  );
  return (res as any[]) || [];
}

export async function getSlateById(id: string) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    db.select().from(schema.slates).where({ id }).limit(1)[0]
  );
  return res as Selectable<any> | null;
}

// ─── Slate Tasks ────────────────────────────────────────────────────

export async function getSlateTasksBySlate(slateId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.slateTasks).where({ slateId })
  );
  return (res as any[]) || [];
}

// ─── Slates CRUD ────────────────────────────────────────────────────

export async function createSlate(data: Insertable<any>) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    rawInsert("slates", { ...data, id: `slate-${Date.now()}`, created_at: nowISO(), updated_at: nowISO() })
  );
  return res || null;
}

export async function updateSlate(id: string, data: Partial<any>) {
  const db = await ensureDb();
  if (!db) return null;
  return rawUpdate("slates", data, "id", id) || null;
}

// ─── Slate Tasks CRUD ──────────────────────────────────────────────

export async function createSlateTask(data: Insertable<any>) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    rawInsert("slate_tasks", { ...data, id: `stask-${Date.now()}`, created_at: nowISO(), updated_at: nowISO() })
  );
  return res || null;
}

export async function updateSlateTask(id: string, data: Partial<any>) {
  const db = await ensureDb();
  if (!db) return null;
  return rawUpdate("slate_tasks", data, "id", id) || null;
}

export async function deleteSlateTask(id: string) {
  const db = await ensureDb();
  if (!db) return false;
  await safeQuery(rawDeleteWhere("slate_tasks", [{ col: "id", val: id }]));
  return true;
}


export async function getJobsByList(listId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.jobs).where({ listId })
  );
  return (res as any[]) || [];
}

export async function getJobsByFamily(familyId: string) {
  const db = await ensureDb();
  if (!db) return [];
  // Stub for now — jobs don't have a direct family_id relationship
  const res = await safeQuery(
    db.select().from(schema.jobs).where({ listId: '' })
  );
  return (res as any[]) || [];
}

export async function getJobById(id: string) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    db.select().from(schema.jobs).where({ id }).limit(1)[0]
  );
  return res as Selectable<any> | null;
}

export async function createJob(data: Insertable<any>) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    rawInsert("jobs", { ...data, id: `job-${Date.now()}`, created_at: nowISO(), updated_at: nowISO() })
  );
  return res || null;
}

export async function updateJob(id: string, data: Partial<any>) {
  const db = await ensureDb();
  if (!db) return null;
  return rawUpdate("jobs", data, "id", id) || null;
}

export async function deleteJob(id: string) {
  const db = await ensureDb();
  if (!db) return false;
  await safeQuery(rawDeleteWhere("jobs", [{ col: "id", val: id }]));
  return true;
}

// ─── Lists ──────────────────────────────────────────────────────────

export async function getListsByFamily(familyId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.lists).where({ familyId })
  );
  return (res as any[]) || [];
}

export async function getListBySlateAndDate(slateId: string, startDate: Date) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    db.select().from(schema.lists).where({ slateId, startDate }).limit(1)[0]
  );
  return res as Selectable<any> | null;
}

export async function createList(data: Insertable<any>) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    rawInsert("lists", { ...data, id: `list-${Date.now()}`, created_at: nowISO(), updated_at: nowISO() })
  );
  return res || null;
}

// ─── List Tasks ─────────────────────────────────────────────────────

export async function getListTasksByList(listId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.listTasks).where({ listId })
  );
  return (res as any[]) || [];
}

export async function createListTask(data: Insertable<any>) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    rawInsert("list_tasks", { ...data, id: `ltask-${Date.now()}`, created_at: nowISO(), updated_at: nowISO() })
  );
  return res || null;
}

// ─── Rotations ──────────────────────────────────────────────────────

export async function getRotationsBySlate(slateId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.rotations).where({ slateId })
  );
  return (res as any[]) || [];
}

export async function getRotationsByFamily(familyId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const familyUsers = await safeQuery(
    db.select().from(schema.users).where({ familyId })
  );
  if ((familyUsers as any[] | null)?.length === 0 || !(familyUsers as any[] | null)) return [];

  const slates = await safeQuery(
    db.select().from(schema.slates).where({ familyId })
  );
  if ((slates as any[] | null)?.length === 0 || !(slates as any[] | null)) return [];

  const slateIds = (slates as any[]).map((s: any) => s.id);
  const res = await safeQuery(
    db.select().from(schema.rotations).where(sql`${schema.rotations.slateId} IN (${sql.join(slateIds, sql`, `)})`)
  );
  return (res as any[]) || [];
}

export async function upsertRotation(data: {
  id?: string;
  slateId: string;
  userId: string;
  order: number;
  intervalDays: number;
  isActive?: boolean;
}) {
  const db = await ensureDb();
  if (!db) return null;
  const existing = await safeQuery(
    db.select().from(schema.rotations).where({ id: data.id }).limit(1)[0]
  );

  if (existing && data.id) {
    return rawUpdate("rotations", {
      slate_id: data.slateId,
      user_id: data.userId,
      order: data.order,
      interval_days: data.intervalDays,
      is_active: data.isActive ?? true,
    }, "id", data.id) || null;
  }

  const res = await safeQuery(
    rawInsert("rotations", {
      id: `rot-${Date.now()}`,
      slate_id: data.slateId,
      user_id: data.userId,
      "order": data.order,
      interval_days: data.intervalDays,
      is_active: data.isActive ?? true,
    })
  );
  return res || null;
}

export async function deleteRotation(id: string) {
  const db = await ensureDb();
  if (!db) return false;
  await safeQuery(rawDeleteWhere("rotations", [{ col: "id", val: id }]));
  return true;
}

export async function deleteRotationsBySlate(slateId: string) {
  const db = await ensureDb();
  if (!db) return false;
  await safeQuery(rawDeleteWhere("rotations", [{ col: "slate_id", val: slateId }]));
  return true;
}

// ─── Comments & History ─────────────────────────────────────────────

export async function getCommentsByJob(jobId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.comments).where({ jobId })
  );
  return (res as any[]) || [];
}

export async function addComment(data: Insertable<any>) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    rawInsert("comments", { ...data, id: `comment-${Date.now()}`, created_at: nowISO(), updated_at: nowISO() })
  );
  return res || null;
}

// ─── Reports ────────────────────────────────────────────────────────

export async function getReportsByFamily(familyId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.reports).where({ familyId })
  );
  return (res as any[]) || [];
}

export async function createReport(data: Insertable<any>) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    rawInsert("reports", { ...data, id: `report-${Date.now()}`, created_at: nowISO(), updated_at: nowISO() })
  );
  return res || null;
}

// ─── Job Status Transitions ───────────────────────────────────────────

export async function transitionJob(id: string, newStatus: string, userId?: string) {
  const db = await ensureDb();
  if (!db) return null;

  const job = await safeQuery(
    db.select().from(schema.jobs).where({ id }).limit(1)[0]
  );
  if (!job) return null;

  const currentStatus = (job as any).status;
  if (!canTransition(currentStatus, newStatus)) {
    error({ currentStatus, newStatus, id }, `Invalid job transition: ${currentStatus} -> ${newStatus} for job ${id}`);
    throw new Error(`Invalid transition from "${currentStatus}" to "${newStatus}"`);
  }

  const now = new Date();
  const updateData: Record<string, any> = { status: newStatus, updated_at: now };
  if (newStatus === "done") {
    updateData.completed_at = now;
  }

  const updatedJob = await rawUpdate("jobs", updateData, "id", id);

  if (updatedJob) {
    try {
      _createJobHistory(id, "status_change", `Status changed from "${currentStatus}" to "${newStatus}"`, userId);
    } catch (historyErr) {
      error({ err: historyErr }, "Failed to write job history");
    }
  }

  return updatedJob;
}

export async function completeJob(id: string, userId?: string) {
  const db = await ensureDb();
  if (!db) return null;

  const job = await safeQuery(
    db.select().from(schema.jobs).where({ id }).limit(1)[0]
  );
  if (!job) return null;

  const currentStatus = (job as any).status;

  // Transition to done status first (if not already done)
  if (currentStatus !== "done") {
    await transitionJob(id, "done", userId);
  }

  try {
    // Mark all uncompleted job subtasks as completed
    const now = new Date();
    await db.update(schema.jobSubtasks)
      .set({ completedAt: now })
      .where(and(eq(schema.jobSubtasks.jobId, id), sql`${schema.jobSubtasks.completedAt} IS NULL`));

    // Fetch all completed subtasks for this job to calculate points
    const completedSubtasks = await safeQuery(
      db.select().from(schema.jobSubtasks).where({ jobId: id })
    );

    // Calculate total points: base job points + completed subtask points
    const totalPoints = calculateJobPoints(job as any, (completedSubtasks as any[]) || []);

    // Award points to user if userId provided
    if (userId && totalPoints > 0) {
      const user = await safeQuery(
        db.select().from(schema.users).where({ id: userId }).limit(1)[0]
      );
      if (user) {
        const newTotal = ((user as any).pointsTotal || 0) + totalPoints;
        await safeQuery(
          db.update(schema.users).set({ pointsTotal: newTotal }).where({ id: userId })
        );
      }
    }
  } catch (err) {
    error({ err: err }, "completeJob failed");
    throw error;
  }

  return job;
}

// ─── Subtask Management ──────────────────────────────────────────────

export async function getPendingSubtasks(jobId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.jobSubtasks).where(and(eq(schema.jobSubtasks.jobId, jobId), sql`${schema.jobSubtasks.completedAt} IS NULL`))
  );
  return (res as any[]) || [];
}

export async function completeSubtask(id: string, jobId: string, userId?: string) {
  const db = await ensureDb();
  if (!db) return 0;

  try {
    // Get the job to check its status
    const job = await safeQuery(
      db.select().from(schema.jobs).where({ id: jobId }).limit(1)[0]
    );
    if (!job) return 0;

    // Subtasks can only be completed on active jobs (status !== "done")
    if ((job as any).status === "done") {
      throw new Error("Cannot complete subtask for a job that is already done");
    }

    // Get the subtask record to find its points
    const subtaskRecord = await safeQuery(
      db.select().from(schema.jobSubtasks).where(and(eq(schema.jobSubtasks.id, id), eq(schema.jobSubtasks.jobId, jobId))).limit(1)[0]
    );
    if (!subtaskRecord) return 0;

    // Get the points to award
    const pointsAwarded = (subtaskRecord as any).pointsAwarded || 0;

    // Mark as completed
    await safeQuery(
      db.update(schema.jobSubtasks).set({ completedAt: new Date() }).where({ id })
    );

    // Create history entry
    _createJobHistory(jobId, "subtask_completed", `Subtask ${id} completed, ${pointsAwarded} points awarded`, userId);

    // Award points to user if userId provided
    if (userId && pointsAwarded > 0) {
      const user = await safeQuery(
        db.select().from(schema.users).where({ id: userId }).limit(1)[0]
      );
      if (user) {
        const newTotal = ((user as any).pointsTotal || 0) + pointsAwarded;
        await safeQuery(
          db.update(schema.users).set({ pointsTotal: newTotal }).where({ id: userId })
        );
      }
    }

    return pointsAwarded;
  } catch (err) {
    error({ err: err }, "completeSubtask failed");
    throw error;
  }
}

// ─── Subtask CRUD (additional) ──────────────────────────────────────

export async function updateSubtask(id: string, data: Partial<any>) {
  const db = await ensureDb();
  if (!db) return null;
  return rawUpdate("subtasks", data, "id", id) || null;
}

export async function deleteSubtask(id: string) {
  const db = await ensureDb();
  if (!db) return false;
  await safeQuery(rawDeleteWhere("subtasks", [{ col: "id", val: id }]));
  return true;
}

export async function getSubtasksByFamily(familyId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.subtasks).where({ familyId })
  );
  return (res as any[]) || [];
}

// ─── Photos CRUD ──────────────────────────────────────────────────────

export async function getPhotosByObject(objectType: string, objectId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.photos).where({ objectType, objectId }).orderBy(sql`${schema.photos.order} ASC`)
  );
  return (res as any[]) || [];
}

export async function createPhoto(data: Insertable<any>) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    rawInsert("photos", { ...data, id: `photo-${Date.now()}`, created_at: nowISO(), updated_at: nowISO() })
  );
  return res || null;
}

export async function updatePhoto(id: string, data: Partial<any>) {
  const db = await ensureDb();
  if (!db) return null;
  return rawUpdate("photos", data, "id", id) || null;
}

export async function deletePhoto(id: string) {
  const db = await ensureDb();
  if (!db) return false;
  await safeQuery(rawDeleteWhere("photos", [{ col: "id", val: id }]));
  return true;
}

// ─── Reviews CRUD ──────────────────────────────────────────────────────

export async function getReviewsByFamily(familyId: string, status?: string) {
  const db = await ensureDb();
  if (!db) return [];
  
  let query = db.select({
    review: schema.reviews,
    job: schema.jobs,
    user: schema.users,
  })
    .from(schema.reviews)
    .leftJoin(schema.jobs, eq(schema.reviews.jobId, schema.jobs.id))
    .leftJoin(schema.users, eq(schema.reviews.reviewerId, schema.users.id))
    .where({ familyId })
    .orderBy(desc(schema.reviews.createdAt));
  
  if (status) {
    query = db.select({
      review: schema.reviews,
      job: schema.jobs,
      user: schema.users,
    })
      .from(schema.reviews)
      .leftJoin(schema.jobs, eq(schema.reviews.jobId, schema.jobs.id))
      .leftJoin(schema.users, eq(schema.reviews.reviewerId, schema.users.id))
      .where(and(eq(schema.reviews.familyId, familyId), eq(schema.reviews.status, status)))
      .orderBy(desc(schema.reviews.createdAt));
  }
  
  const res = await safeQuery(query);
  return (res as any[]) || [];
}

export async function createReview(data: Insertable<any>) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    rawInsert("reviews", { ...data, id: `review-${Date.now()}`, created_at: nowISO(), updated_at: nowISO() })
  );
  return res || null;
}

export async function updateReview(id: string, data: Partial<any>) {
  const db = await ensureDb();
  if (!db) return null;
  return rawUpdate("reviews", data, "id", id) || null;
}

export async function deleteReview(id: string) {
  const db = await ensureDb();
  if (!db) return false;
  await safeQuery(rawDeleteWhere("reviews", [{ col: "id", val: id }]));
  return true;
}

// ─── Invites ────────────────────────────────────────────────────────

export async function getInviteByCode(code: string) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    db.select().from(schema.invites).where({ code }).limit(1)[0]
  );
  return res as Selectable<any> | null;
}

export async function createInvite(data: Insertable<any>) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    rawInsert("invites", { ...data, id: `invite-${Date.now()}`, created_at: nowISO(), updated_at: nowISO() })
  );
  return res || null;
}

// ─── Scoring & Leaderboard ──────────────────────────────────────────

export interface ScoringEntry {
  id: string;
  name: string;
  avatarUrl?: string;
  role: string;
  pointsTotal: number;
  pointsThisWeek: number;
  jobsCompleted: number;
  streakDays: number;
}

export async function getLeaderboard(familyId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const users = await safeQuery(
    db.select().from(schema.users).where({ familyId })
  );
  return ((users as any[]) || []).sort((a, b) => (b.pointsTotal || 0) - (a.pointsTotal || 0));
}

export async function getUserStats(userId: string) {
  const db = await ensureDb();
  if (!db) return null;
  const user = await safeQuery(
    db.select().from(schema.users).where({ id: userId }).limit(1)[0]
  );
  if (!user) return null;

  const jobs = await safeQuery(
    db.select().from(schema.jobs).where({ assignedTo: userId })
  );
  const completedJobs = ((jobs as any[]) || []).filter((j: any) => j.status === "done" && j.completedAt);

  const totalPoints = (user as any).pointsTotal || 0;
  const pointsThisWeek = completedJobs
    .filter((j: any) => new Date(j.completedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    .reduce((sum: number, j: any) => sum + (j.points || 0), 0);

  return {
    user,
    totalPoints,
    jobsCompleted: completedJobs.length,
    pointsThisWeek,
    averagePerDay: Math.round(pointsThisWeek / 7 * 10) / 10,
  };
}

export async function getJobHistory(userId: string, limit = 20) {
  const db = await ensureDb();
  if (!db) return [];
  const jobs = await safeQuery(
    db.select().from(schema.jobs).where({ assignedTo: userId })
      .orderBy(sql`${schema.jobs.completedAt} DESC`).limit(limit)
  );
  return ((jobs as any[]) || []).filter((j: any) => j.status === "done");
}

export async function getWeeklyPoints(userId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const jobs = await safeQuery(
    db.select().from(schema.jobs).where({ assignedTo: userId })
      .orderBy(sql`${schema.jobs.completedAt} ASC`)
  );
  return ((jobs as any[]) || [])
    .filter((j: any) => j.status === "done" && j.completedAt && new Date(j.completedAt) >= sevenDaysAgo)
    .map((j: any) => ({
      date: new Date(j.completedAt).toISOString().split("T")[0],
      points: j.points || 0,
    }));
}

// ─── Swap/Trade Rotations ─────────────────────────────────────────────

export async function swapRotationEntries(
  familyId: string,
  rotationId1: string,
  rotationId2: string,
  userId?: string,
): Promise<any> {
  const db = await ensureDb();
  if (!db) return null;

  try {
    const rotation1 = await safeQuery(
      db.select().from(schema.rotations).where({ id: rotationId1 }).limit(1)[0]
    );
    const rotation2 = await safeQuery(
      db.select().from(schema.rotations).where({ id: rotationId2 }).limit(1)[0]
    );

    if (!rotation1 || !rotation2) return null;

    // Verify both rotations belong to the same slate
    if ((rotation1 as any).slateId !== (rotation2 as any).slateId) {
      error({ rotationId1, rotationId2 }, `Cannot swap rotations from different slates: ${rotationId1} vs ${rotationId2}`);
      throw new Error("Cannot swap rotations from different slates");
    }

    // Swap the order values
    const tempOrder = (rotation1 as any).order;
    await safeQuery(
      db.update(schema.rotations)
        .set({ order: (rotation2 as any).order })
        .where({ id: rotationId1 })
    );

    await safeQuery(
      db.update(schema.rotations)
        .set({ order: tempOrder })
        .where({ id: rotationId2 })
    );

    // Create history entry
    if (userId) {
      try {
        await safeQuery(
          rawInsert("job_history", {
            id: `jh-swap-${Date.now()}`,
            job_id: "swap",
            action: "rotation_swap",
            details: `Swapped rotation entries ${rotationId1} and ${rotationId2}`,
            user_id: userId,
            created_at: nowISO(),
          })
        );
      } catch (historyErr) {
        error({ err: historyErr }, "Failed to write swap history");
      }
    }

    return { success: true };
  } catch (err) {
    error({ err: err }, "swapRotationEntries failed");
    throw error;
  }
}

export async function getRotationSchedule(
  slateId: string,
  startDate: Date,
  endDate: Date,
): Promise<any[]> {
  const db = await ensureDb();
  if (!db) return [];

  const rotations = await safeQuery(
    db.select().from(schema.rotations).where({ slateId })
  );

  if (!rotations || (rotations as any[]).length === 0) return [];

  // Use pure rotation logic to calculate schedule
  const { getRotationSchedule: getRotSchedule } = await import("@/lib/rotation");
  return getRotSchedule(rotations as any[], slateId, startDate, endDate);
}

export async function getUpcomingAssignments(
  familyId: string,
  daysAhead: number = 30,
): Promise<any[]> {
  const db = await ensureDb();
  if (!db) return [];

  const slates = await safeQuery(
    db.select().from(schema.slates).where({ familyId })
  );

  if (!slates || (slates as any[]).length === 0) return [];

  const schedule: any[] = [];
  const today = new Date();

  for (const slate of slates as any[]) {
    const rotations = await safeQuery(
      db.select().from(schema.rotations).where({ slateId: (slate as any).id })
    );

    if (!rotations || (rotations as any[]).length === 0) continue;

    const { getUpcomingAssignments: getUpcoming } = await import("@/lib/rotation");
    const upcoming = getUpcoming(rotations as any[], (slate as any).id, today, daysAhead);
    schedule.push({ slateId: (slate as any).id, assignments: upcoming });
  }

  return schedule;
}

// ─── Tags ───────────────────────────────────────────────────────────

export async function getTagsByFamily(familyId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.tags).where({ familyId })
  );
  return (res as any[]) || [];
}

export async function createTag(data: Insertable<any>) {
  const db = await ensureDb();
  if (!db) return null;
  const res = await safeQuery(
    rawInsert("tags", { ...data, id: `tag-${Date.now()}`, created_at: nowISO(), updated_at: nowISO() })
  );
  return res || null;
}

export async function updateTag(id: string, data: Partial<any>) {
  const db = await ensureDb();
  if (!db) return null;
  return rawUpdate("tags", data, "id", id) || null;
}

export async function deleteTag(id: string) {
  const db = await ensureDb();
  if (!db) return false;
  
  // Use cascade delete via foreign keys
  await Promise.all([
    safeQuery(rawDeleteWhere("task_tags", [{ col: "tag_id", val: id }])),
    safeQuery(rawDeleteWhere("slate_tags", [{ col: "tag_id", val: id }]))
  ]);
  
  return true;
}

export async function getTaskTagIds(taskId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const res = await safeQuery(
    db.select({ tagId: schema.taskTags.tagId })
      .from(schema.taskTags)
      .where({ taskId })
  );
  return (res as any[])?.map((r: any) => r.tagId) || [];
}

export async function setTaskTags(taskId: string, tagIds: string[]) {
  const db = await ensureDb();
  if (!db) return false;
  
  // Remove existing tags
  await safeQuery(rawDeleteWhere("task_tags", [{ col: "task_id", val: taskId }]));
  
  // Add new tags
  if (tagIds.length === 0) return true;
  
  for (const tagId of tagIds) {
    await rawInsert("task_tags", {
      id: `tt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      task_id: taskId,
      tag_id: tagId,
    });
  }
  
  return true;
}

export async function getSlateTags(slateId: string) {
  const db = await ensureDb();
  if (!db) return [];
  const res = await safeQuery(
    db.select({ tagId: schema.slateTags.tagId })
      .from(schema.slateTags)
      .where({ slateId })
  );
  return (res as any[])?.map((r: any) => r.tagId) || [];
}

export async function setSlateTags(slateId: string, tagIds: string[]) {
  const db = await ensureDb();
  if (!db) return false;
  
  // Remove existing tags
  await safeQuery(rawDeleteWhere("slate_tags", [{ col: "slate_id", val: slateId }]));
  
  // Add new tags
  if (tagIds.length === 0) return true;
  
  for (const tagId of tagIds) {
    await rawInsert("slate_tags", {
      id: `stag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      slate_id: slateId,
      tag_id: tagId,
    });
  }
  
  return true;
}

// ─── Core Slate Task Resolution with Tag Auto-Inclusion ─────────────

export async function resolveSlateTaskSet(slateId: string) {
  const db = await ensureDb();
  if (!db) return [];
  
  // Fetch explicit slate tasks (explicit assignments)
  const explicitTasksResult = await safeQuery(
    db.select({
      taskId: schema.slateTasks.taskId,
      pointsOverride: schema.slateTasks.pointsOverride,
      order: schema.slateTasks.order,
      isExplicit: sql`1`,
    }).from(schema.slateTasks).where({ slateId })
  );
  
  // Fetch slate's tags
  const slateTagIds = await getSlateTags(slateId);
  
  // If no explicit tasks and no tags, return empty
  const explicitTasks = (explicitTasksResult || []) as any[];
  if (explicitTasks.length === 0 && slateTagIds.length === 0) {
    return [];
  }
  
  // Fetch tag-matched tasks (auto-inclusion by tag)
  const tagMatchedTasks: Array<{ taskId: string; points: number }> = [];
  
  if (slateTagIds.length > 0) {
    const placeholders = slateTagIds.map(() => '?').join(',');
    const tagPlaceholders = slateTagIds.map(() => '?').join(',');
    
    const tasksWithTags = await safeQuery(
      db.select({
        taskId: schema.tasks.id,
        points: schema.tasks.points,
      })
        .from(schema.tasks)
        .innerJoin(schema.taskTags, eq(schema.tasks.id, schema.taskTags.taskId))
        .where(sql`(${placeholders}, ${tagPlaceholders})`)
    );
    
    if (tasksWithTags) {
      tagMatchedTasks.push(...(tasksWithTags as any[]));
    }
  }
  
  // Dedupe by taskId: explicit rows take priority over tag-matched
  const result = new Map<string, any>();
  
  // First add explicit tasks
  for (const task of explicitTasks) {
    result.set(task.taskId, {
      taskId: task.taskId,
      pointsOverride: task.pointsOverride,
      order: task.order,
      isExplicit: true,
    });
  }
  
  // Then add tag-matched tasks (only if not already explicit)
  for (const task of tagMatchedTasks) {
    if (!result.has(task.taskId)) {
      result.set(task.taskId, {
        taskId: task.taskId,
        pointsOverride: task.points,
        order: 0,
        isExplicit: false,
      });
    }
  }
  
  const slateTasks = Array.from(result.values());
  
  // Sort by explicit=true first, then by order
  slateTasks.sort((a, b) => {
    if (a.isExplicit && !b.isExplicit) return -1;
    if (!a.isExplicit && b.isExplicit) return 1;
    return a.order - b.order;
  });
  
  return slateTasks;
}

