import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

// ─── Global DB Initialization ────────────────────────────────────────

let db: any = null;

async function ensureDb(): Promise<any> {
  if (db) return db;
  db = await initDb();
  return db;
}

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
  } catch {
    return null;
  }
}

// ─── Families ───────────────────────────────────────────────────────

export async function getFamilyById(id: string) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.families).where({ id }).first()
  );
  return res as Selectable<any> | null;
}

export async function getFamilyBySlug(slug: string) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.families).where({ slug }).first()
  );
  return res as Selectable<any> | null;
}

export async function createFamily(data: Insertable<any>) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.insert(schema.families).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
}

export async function updateFamily(id: string, data: Partial<any>) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.update(schema.families).set(data).where({ id }).returning("*")
  );
  return (res as any[])?.[0] || null;
}

// ─── Users ──────────────────────────────────────────────────────────

export async function getUserById(id: string) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.users).where({ id }).first()
  );
  return res as Selectable<any> | null;
}

export async function getUserByEmail(email: string) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.users).where({ email }).first()
  );
  return res as Selectable<any> | null;
}

export async function updateUserPoints(id: string, points: number) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.update(schema.users).set({ pointsTotal: points }).where({ id }).returning("*")
  );
  return (res as any[])?.[0] || null;
}

// ─── Teams ──────────────────────────────────────────────────────────

export async function getTeamsByFamily(familyId: string) {
  if (!db) return [];
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.teams).where({ familyId })
  );
  return (res as any[]) || [];
}

export async function createTeam(data: Insertable<any>) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.insert(schema.teams).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
}

// ─── Tasks ──────────────────────────────────────────────────────────

export async function getTasksByFamily(familyId: string) {
  if (!db) return [];
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.tasks).where({ familyId })
  );
  return (res as any[]) || [];
}

export async function getTaskById(id: string) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.tasks).where({ id }).first()
  );
  return res as Selectable<any> | null;
}

export async function createTask(data: Insertable<any>) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.insert(schema.tasks).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
}

export async function updateTask(id: string, data: Partial<any>) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.update(schema.tasks).set(data).where({ id }).returning("*")
  );
  return (res as any[])?.[0] || null;
}

export async function deleteTask(id: string) {
  if (!db) return false;
  await safeQuery(db.delete(schema.tasks).where({ id }));
  return true;
}

// ─── Subtasks ───────────────────────────────────────────────────────

export async function getSubtasksByTask(taskId: string) {
  if (!db) return [];
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.subtasks).where({ taskId })
  );
  return (res as any[]) || [];
}

export async function createSubtask(data: Insertable<any>) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.insert(schema.subtasks).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
}

// ─── Slates ─────────────────────────────────────────────────────────

export async function getSlatesByFamily(familyId: string) {
  if (!db) return [];
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.slates).where({ familyId })
  );
  return (res as any[]) || [];
}

export async function getSlateById(id: string) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.slates).where({ id }).first()
  );
  return res as Selectable<any> | null;
}

// ─── Slate Tasks ────────────────────────────────────────────────────

export async function getSlateTasksBySlate(slateId: string) {
  if (!db) return [];
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.slateTasks).where({ slateId })
  );
  return (res as any[]) || [];
}

// ─── Jobs ───────────────────────────────────────────────────────────

export async function getJobsByList(listId: string) {
  if (!db) return [];
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.jobs).where({ listId })
  );
  return (res as any[]) || [];
}

export async function getJobsByFamily(familyId: string) {
  if (!db) return [];
  // Stub for now — jobs don't have a direct family_id relationship
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.jobs).where({ listId: '' })
  );
  return (res as any[]) || [];
}

export async function getJobById(id: string) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.jobs).where({ id }).first()
  );
  return res as Selectable<any> | null;
}

export async function createJob(data: Insertable<any>) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.insert(schema.jobs).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
}

export async function updateJob(id: string, data: Partial<any>) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.update(schema.jobs).set(data).where({ id }).returning("*")
  );
  return (res as any[])?.[0] || null;
}

// ─── Lists ──────────────────────────────────────────────────────────

export async function getListsByFamily(familyId: string) {
  if (!db) return [];
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.lists).where({ familyId })
  );
  return (res as any[]) || [];
}

export async function getListBySlateAndDate(slateId: string, startDate: Date) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.lists).where({ slateId, startDate }).first()
  );
  return res as Selectable<any> | null;
}

export async function createList(data: Insertable<any>) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.insert(schema.lists).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
}

// ─── List Tasks ─────────────────────────────────────────────────────

export async function getListTasksByList(listId: string) {
  if (!db) return [];
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.listTasks).where({ listId })
  );
  return (res as any[]) || [];
}

export async function createListTask(data: Insertable<any>) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.insert(schema.listTasks).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
}

// ─── Rotations ──────────────────────────────────────────────────────

export async function getRotationsBySlate(slateId: string) {
  if (!db) return [];
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.rotations).where({ slateId })
  );
  return (res as any[]) || [];
}

export async function getRotationsByFamily(familyId: string) {
  if (!db) return [];
  const familyUsers = await safeQuery(
    db.select().dbInstance.from(schema.users).where({ familyId })
  );
  if ((familyUsers as any[] | null)?.length === 0 || !(familyUsers as any[] | null)) return [];

  const slates = await safeQuery(
    db.select().dbInstance.from(schema.slates).where({ familyId })
  );
  if ((slates as any[] | null)?.length === 0 || !(slates as any[] | null)) return [];

  const slateIds = (slates as any[]).map((s: any) => s.id);
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.rotations).where(sql`${schema.rotations.slateId} IN (${sql.join(slateIds, sql`, `)})`)
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
  if (!db) return null;
  const existing = await safeQuery(
    db.select().dbInstance.from(schema.rotations).where({ id: data.id }).first()
  );

  if (existing && data.id) {
    const dbInstance = await ensureDb(); const res = await safeQuery(
      db.update(schema.rotations)
        .set({
          slateId: data.slateId,
          userId: data.userId,
          order: data.order,
          intervalDays: data.intervalDays,
          isActive: data.isActive ?? true,
        })
        .where({ id: data.id })
        .returning("*")
    );
    return (res as any[])?.[0] || null;
  }

  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.insert(schema.rotations).values({
      slateId: data.slateId,
      userId: data.userId,
      order: data.order,
      intervalDays: data.intervalDays,
      isActive: data.isActive ?? true,
    }).returning("*")
  );
  return (res as any[])?.[0] || null;
}

export async function deleteRotation(id: string) {
  if (!db) return false;
  await safeQuery(db.delete(schema.rotations).where({ id }));
  return true;
}

export async function deleteRotationsBySlate(slateId: string) {
  if (!db) return false;
  await safeQuery(db.delete(schema.rotations).where({ slateId }));
  return true;
}

// ─── Comments & History ─────────────────────────────────────────────

export async function getCommentsByJob(jobId: string) {
  if (!db) return [];
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.comments).where({ jobId })
  );
  return (res as any[]) || [];
}

export async function addComment(data: Insertable<any>) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.insert(schema.comments).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
}

// ─── Reports ────────────────────────────────────────────────────────

export async function getReportsByFamily(familyId: string) {
  if (!db) return [];
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.reports).where({ familyId })
  );
  return (res as any[]) || [];
}

export async function createReport(data: Insertable<any>) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.insert(schema.reports).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
}

// ─── Job Status Transitions ───────────────────────────────────────────

export async function transitionJob(id: string, newStatus: string, userId?: string) {
  if (!db) return null;

  const job = await safeQuery(
    db.select().dbInstance.from(schema.jobs).where({ id }).first()
  );
  if (!job) return null;

  const currentStatus = (job as any).status;
  if (!canTransition(currentStatus, newStatus)) {
    throw new Error(`Invalid transition from "${currentStatus}" to "${newStatus}"`);
  }

  const now = new Date();
  const updateData: Record<string, any> = { status: newStatus, updatedAt: now };
  if (newStatus === "done") {
    updateData.completedAt = now;
  }

  const updatedJob = await safeQuery(
    db.update(schema.jobs).set(updateData).where({ id }).returning("*")
  );

  if (updatedJob) {
    _createJobHistory(id, "status_change", `Status changed from "${currentStatus}" to "${newStatus}"`, userId);
  }

  return updatedJob;
}

export async function completeJob(id: string, userId?: string) {
  if (!db) return null;

  const job = await safeQuery(
    db.select().dbInstance.from(schema.jobs).where({ id }).first()
  );
  if (!job) return null;

  const currentStatus = (job as any).status;

  // Transition to done status first (if not already done)
  if (currentStatus !== "done") {
    await transitionJob(id, "done", userId);
  }

  // Mark all uncompleted job subtasks as completed
  const now = new Date();
  await db.update(schema.jobSubtasks)
    .set({ completedAt: now })
    .where(and(eq(schema.jobSubtasks.jobId, id), sql`${schema.jobSubtasks.completedAt} IS NULL`));

  // Fetch all completed subtasks for this job to calculate points
  const completedSubtasks = await safeQuery(
    db.select().dbInstance.from(schema.jobSubtasks).where({ jobId: id })
  );

  // Calculate total points: base job points + completed subtask points
  const totalPoints = calculateJobPoints(job as any, (completedSubtasks as any[]) || []);

  // Award points to user if userId provided
  if (userId && totalPoints > 0) {
    const user = await safeQuery(
      db.select().dbInstance.from(schema.users).where({ id: userId }).first()
    );
    if (user) {
      const newTotal = ((user as any).pointsTotal || 0) + totalPoints;
      await db.update(schema.users).set({ pointsTotal: newTotal }).where({ id: userId });
    }
  }

  return job;
}

// ─── Subtask Management ──────────────────────────────────────────────

export async function getPendingSubtasks(jobId: string) {
  if (!db) return [];
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.jobSubtasks).where(and(eq(schema.jobSubtasks.jobId, jobId), sql`${schema.jobSubtasks.completedAt} IS NULL`))
  );
  return (res as any[]) || [];
}

export async function completeSubtask(id: string, jobId: string, userId?: string) {
  if (!db) return 0;

  // Get the job to check its status
  const job = await safeQuery(
    db.select().dbInstance.from(schema.jobs).where({ id: jobId }).first()
  );
  if (!job) return 0;

  // Subtasks can only be completed on active jobs (status !== "done")
  if ((job as any).status === "done") {
    throw new Error("Cannot complete subtask for a job that is already done");
  }

  // Get the subtask record to find its points
  const subtaskRecord = await safeQuery(
    db.select().dbInstance.from(schema.jobSubtasks).where(and(eq(schema.jobSubtasks.id, id), eq(schema.jobSubtasks.jobId, jobId))).first()
  );
  if (!subtaskRecord) return 0;

  // Get the points to award
  const pointsAwarded = (subtaskRecord as any).pointsAwarded || 0;

  // Mark as completed
  await db.update(schema.jobSubtasks).set({ completedAt: new Date() }).where({ id });

  // Create history entry
  _createJobHistory(jobId, "subtask_completed", `Subtask ${id} completed, ${pointsAwarded} points awarded`, userId);

  // Award points to user if userId provided
  if (userId && pointsAwarded > 0) {
    const user = await safeQuery(
      db.select().dbInstance.from(schema.users).where({ id: userId }).first()
    );
    if (user) {
      const newTotal = ((user as any).pointsTotal || 0) + pointsAwarded;
      await db.update(schema.users).set({ pointsTotal: newTotal }).where({ id: userId });
    }
  }

  return pointsAwarded;
}

// ─── Invites ────────────────────────────────────────────────────────

export async function getInviteByCode(code: string) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.select().dbInstance.from(schema.invites).where({ code }).first()
  );
  return res as Selectable<any> | null;
}

export async function createInvite(data: Insertable<any>) {
  if (!db) return null;
  const dbInstance = await ensureDb(); const res = await safeQuery(
    db.insert(schema.invites).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
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
  if (!db) return [];
  const users = await safeQuery(
    db.select().dbInstance.from(schema.users).where({ familyId })
  );
  return ((users as any[]) || []).sort((a, b) => (b.pointsTotal || 0) - (a.pointsTotal || 0));
}

export async function getUserStats(userId: string) {
  if (!db) return null;
  const user = await safeQuery(
    db.select().dbInstance.from(schema.users).where({ id: userId }).first()
  );
  if (!user) return null;

  const jobs = await safeQuery(
    db.select().dbInstance.from(schema.jobs).where({ assignedTo: userId })
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
  if (!db) return [];
  const jobs = await safeQuery(
    db.select().dbInstance.from(schema.jobs).where({ assignedTo: userId })
      .orderBy(sql`${schema.jobs.completedAt} DESC`).limit(limit)
  );
  return ((jobs as any[]) || []).filter((j: any) => j.status === "done");
}

export async function getWeeklyPoints(userId: string) {
  if (!db) return [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const jobs = await safeQuery(
    db.select().dbInstance.from(schema.jobs).where({ assignedTo: userId })
      .orderBy(sql`${schema.jobs.completedAt} ASC`)
  );
  return ((jobs as any[]) || [])
    .filter((j: any) => j.status === "done" && j.completedAt && new Date(j.completedAt) >= sevenDaysAgo)
    .map((j: any) => ({
      date: new Date(j.completedAt).toISOString().split("T")[0],
      points: j.points || 0,
    }));
}
