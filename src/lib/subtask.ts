// ─── Subtask Management & Point Calculation ──────────────────────────

import { db } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

type Subtask = any;
type JobHistory = any;

export interface PendingSubtask {
  id: string;
  subtaskId: string;
  pointsAwarded: number;
}

/**
 * Get pending subtasks for a job (not yet completed).
 */
export async function getPendingSubtasks(jobId: string): Promise<PendingSubtask[]> {
  if (!db) return [];

  const results = await db.select().from(schema.jobSubtasks).where(
    and(eq(schema.jobSubtasks.jobId, jobId), sql`${schema.jobSubtasks.completedAt} IS NULL`)
  );
  return (results as any[]) || [];
}

/**
 * Check if a single subtask is pending (pure function).
 */
export function isPending(subtask: Subtask): boolean {
  return !!subtask && !subtask?.completedAt;
}

/**
 * Get the number of pending subtasks for a job.
 */
export function getPendingCount(jobSubtasks: any[]): number {
  if (!jobSubtasks || jobSubtasks.length === 0) return 0;
  return jobSubtasks.filter((st) => isPending(st)).length;
}

/**
 * Complete a single subtask and award its points.
 */
export async function completeSubtask(subtaskId: string, jobId: string, userId?: string): Promise<number> {
  if (!db) return 0;

  // Get the job to check its status
  const job = (await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).limit(1))[0];
  if (!job) return 0;

  // Subtasks can only be completed on active jobs (status !== "done")
  if ((job as any).status === "done") {
    throw new Error("Cannot complete subtask for a job that is already done");
  }

  // Get the subtask record to find its points
  const subtaskRecord = await db.select().from(schema.jobSubtasks).where(
    and(eq(schema.jobSubtasks.id, subtaskId), eq(schema.jobSubtasks.jobId, jobId))
  ).limit(1)[0];

  if (!subtaskRecord) return 0;

  // Get the points to award
  const pointsAwarded = (subtaskRecord as any).pointsAwarded || 0;

  // Mark as completed
  const now = new Date();
  await db.update(schema.jobSubtasks).set({ completedAt: now }).where(eq(schema.jobSubtasks.id, subtaskId));

  // Create history entry
  await (
    db.insert(schema.jobHistory).values({
      jobId,
      action: "subtask_completed",
      details: `Subtask ${subtaskId} completed, ${pointsAwarded} points awarded`,
      userId,
    }).returning("*") as any
  );

  // Award points to user if userId provided
  if (userId && pointsAwarded > 0) {
    const user = (await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1))[0];
    if (user) {
      const newTotal = ((user as any).pointsTotal || 0) + pointsAwarded;
      await db.update(schema.users).set({ pointsTotal: newTotal }).where(eq(schema.users.id, userId));
    }
  }

  return pointsAwarded;
}
