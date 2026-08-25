// ─── Job Status Transition Logic ──────────────────────────────────────

import { db } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export const VALID_TRANSITIONS: Record<string, string[]> = {
  todo: ["doing"],
  doing: ["todo", "done", "under_review"],
  done: [],
  under_review: ["done", "doing"],
};

/**
 * Validate if a status transition is allowed (pure function).
 */
export function canTransition(status: string, newStatus: string): boolean {
  return VALID_TRANSITIONS[status]?.includes(newStatus) ?? false;
}

/**
 * Get the valid next statuses for a given status.
 */
export function getValidNextStatuses(status: string): string[] {
  return VALID_TRANSITIONS[status] ?? [];
}

/**
 * Calculate points to award when transitioning a job to "done".
 * Uses the existing calculatePoints pattern from points.ts logic.
 */
export function calculateJobPoints(job: any, completedSubtasks?: any[]): number {
  let total = job?.points || 0;

  if (completedSubtasks && completedSubtasks.length > 0) {
    for (const subtask of completedSubtasks) {
      if (subtask.completedAt) {
        total += subtask.pointsAwarded || subtask.points || 0;
      }
    }
  }

  return total;
}

type Job = any;
type JobHistory = any;

/**
 * Create a history entry in jobHistory table.
 */
export async function createJobHistory(jobId: string, action: string, details?: string, userId?: string): Promise<JobHistory | null> {
  if (!db) return null;

  const res = await (
    db.insert(schema.jobHistory).values({
      jobId,
      action,
      details,
      userId,
    }).returning("*") as any
  );
  return (res as any[] | null)?.[0] || null;
}

/**
 * Transition a job through its workflow.
 */
export async function transitionJob(jobId: string, newStatus: string, userId?: string): Promise<Job | null> {
  if (!db) return null;

  const job = (await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).limit(1))[0];
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

  const updatedJob = await db.update(schema.jobs).set(updateData).where(eq(schema.jobs.id, jobId)).returning("*");
  const result = (updatedJob as any[] | null)?.[0] || null;

  if (result) {
    await createJobHistory(jobId, "status_change", `Status changed from "${currentStatus}" to "${newStatus}"`, userId);
  }

  return result;
}

/**
 * Complete all subtasks for a job and award points.
 */
export async function completeJob(jobId: string, userId?: string): Promise<Job | null> {
  if (!db) return null;

  const job = (await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).limit(1))[0];
  if (!job) return null;

  const currentStatus = (job as any).status;

  // Transition to done status first (if not already done)
  if (currentStatus !== "done") {
    await transitionJob(jobId, "done", userId);
  }

  // Mark all uncompleted job subtasks as completed
  const now = new Date();
  await db.update(schema.jobSubtasks)
    .set({ completedAt: now })
    .where(and(eq(schema.jobSubtasks.jobId, jobId), sql`${schema.jobSubtasks.completedAt} IS NULL`));

  // Fetch all completed subtasks for this job to calculate points
  const completedSubtasks = await db.select().from(schema.jobSubtasks).where(eq(schema.jobSubtasks.jobId, jobId));

  // Calculate total points: base job points + completed subtask points
  const totalPoints = calculateJobPoints(job as any, completedSubtasks);

  // Award points to user if userId provided
  if (userId && totalPoints > 0) {
    const user = (await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1))[0];
    if (user) {
      const newTotal = ((user as any).pointsTotal || 0) + totalPoints;
      await db.update(schema.users).set({ pointsTotal: newTotal }).where(eq(schema.users.id, userId));
    }
  }

  return job as any;
}
