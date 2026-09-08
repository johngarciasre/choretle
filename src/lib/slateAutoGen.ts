import { shouldGenerateList } from "./points";
import { calculateRotationAssignment } from "./rotation";

// ─── Types ──────────────────────────────────────────────────────────

export interface SlateGenerationContext {
  slateId: string;
  familyId: string;
  date: Date;
}

export interface GeneratedJob {
  id: string;
  listId: string;
  slateTaskId: string;
  assignedTo?: string;
  name: string;
  points: number;
  status: string;
  dueDate: Date;
}

// ─── Slate-to-List Generation Service ────────────────────────────────

/**
 * Get or create a list for a slate on the target date.
 */
export async function getOrCreateList(slateId: string, familyId: string, date: Date): Promise<any> {
  const { getListBySlateAndDate, createList } = await import("@/lib/db/service");

  const existing = await getListBySlateAndDate(slateId, date);
  if (existing) return existing;

  const endDate = new Date(date);
  endDate.setDate(endDate.getDate() + 1);

  const list = await createList({
    slateId,
    familyId,
    name: `List - ${date.toISOString().slice(0, 10)}`,
    startDate: date,
    endDate,
    period: "day",
    status: "active",
  });

  return list;
}

/**
 * Generate jobs from a slate for the given date.
 * Uses rotation assignment logic when configured, otherwise assigns to all users.
 */
export async function generateJobsFromSlate(
  slateId: string,
  familyId: string,
  targetDate: Date,
): Promise<GeneratedJob[]> {
  // Skip if list already exists for this slate/date (exact calendar day match)
  const { getListBySlateAndExactDate, ...rest } = await import("@/lib/db/service");
  const {
    getRotationsBySlate,
    createList,
    createListTask,
    createJob,
    resolveSlateTaskSet,
  } = rest;

  // Skip if list already exists for this slate/date (exact calendar day match)
  const existingList = await getListBySlateAndExactDate(slateId, targetDate);
  if (existingList) return [];

  // Create the list
  const endDate = new Date(targetDate);
  endDate.setDate(endDate.getDate() + 1);

  const list = await createList({
    slateId,
    familyId,
    name: `List - ${targetDate.toISOString().slice(0, 10)}`,
    startDate: targetDate,
    endDate,
    period: "day",
    status: "active",
  });

  if (!list?.id) return [];

  // Get slate tasks WITH TAG AUTO-INCLUSION (explicit + tag-matched)
  const slateTasks = await resolveSlateTaskSet(slateId);
  if (!slateTasks || slateTasks.length === 0) return [];

  const rotations = await getRotationsBySlate(slateId);

  // Normalize rotation rows: DB returns snake_case (user_id, slate_id),
  // but calculateRotationAssignment expects camelCase (userId, slateId).
  const normalizedRotations = (rotations || []).map((r: any) => ({
    id: r.id || r.id,
    slateId: r.slate_id || r.slateId,
    userId: r.user_id || r.userId,
    order: r.order ?? r["order"] ?? 0,
    intervalDays: r.interval_days ?? r.intervalDays ?? 7,
    isActive: r.is_active ?? r.isActive !== false,
    createdAt: r.created_at || r.createdAt,
  }));

  // Map resolveSlateTaskSet output to calculateRotationAssignment input shape.
  // resolveSlateTaskSet returns { taskId, pointsOverride, order, isExplicit },
  // but calculateRotationAssignment expects { id, slateId }.
  const rotationTasks = slateTasks.map((st: any) => ({
    id: st.taskId,
    slateId,
  }));

  // Determine assignments
  let assignments: Map<string, string[]> = new Map();

  if (normalizedRotations && normalizedRotations.length > 0) {
    assignments = calculateRotationAssignment(rotationTasks, normalizedRotations, targetDate);
  } else {
    // No rotations configured — assign all tasks without specific user
    for (const slateTask of slateTasks) {
      const job = await createJob({
        listId: list.id,
        slateTaskId: slateTask.taskId,
        name: slateTask.taskName || `Task ${slateTask.taskId.slice(-6)}`,
        points: slateTask.pointsOverride || 0,
        status: "todo",
        dueDate: targetDate,
      });

      if (job?.id) {
        await createListTask({
          listId: list.id,
          slateTaskId: slateTask.taskId,
          pointsOverride: slateTask.pointsOverride,
        });
      }
    }
    return []; // Return empty since jobs aren't assigned to users in this case
  }

  // Create jobs for each rotation assignment
  const result: GeneratedJob[] = [];

  for (const [userId, taskIds] of assignments.entries()) {
    for (const slateTaskId of taskIds) {
      const slateTask = slateTasks.find((st: any) => st.taskId === slateTaskId);
      if (!slateTask) continue;

      const job = await createJob({
        listId: list.id,
        slateTaskId: slateTask.taskId,
        assignedTo: userId,
        name: slateTask.taskName || `Task ${slateTask.taskId.slice(-6)}`,
        points: slateTask.pointsOverride || 0,
        status: "todo",
        dueDate: targetDate,
      });

      if (job?.id) {
        await createListTask({
          listId: list.id,
          slateTaskId: slateTask.taskId,
          pointsOverride: slateTask.pointsOverride,
        });
        result.push(job);
      }
    }
  }

  return result;
}

/**
 * Auto-generate jobs for all active slates that need them on the given date.
 */
export async function autoGenerateJobs(
  familyId: string,
  targetDate?: Date,
): Promise<GeneratedJob[]> {
  const { getSlatesByFamily } = await import("@/lib/db/service");

  const date = targetDate || new Date();
  const rawSlates = await getSlatesByFamily(familyId);

  if (!rawSlates || rawSlates.length === 0) return [];

  console.log(`[autoGen] familyId=${familyId} date=${date.toISOString()} slates=${rawSlates.length}`);

  // Normalize snake_case DB columns to camelCase for shouldGenerateList
  const slates = rawSlates.map((s: any) => ({
    ...s,
    isActive: s.is_active ?? s.isActive,
    createdAt: s.created_at || s.createdAt,
    frequency: s.frequency,
    interval: s.interval,
  }));

  // Find active slates using pure functions from points.ts
  const activeSlates = slates.filter((s: any) => shouldGenerateList(s, date));
  console.log(`[autoGen] activeSlates=${activeSlates.length}`);

  const allJobs: GeneratedJob[] = [];

  for (const slate of activeSlates) {
    try {
      console.log(`[autoGen] Generating for slate ${slate.id} (${slate.name})`);
      const jobs = await generateJobsFromSlate(slate.id, familyId, date);
      console.log(`[autoGen] Generated ${jobs.length} jobs for slate ${slate.id}`);
      allJobs.push(...jobs);
    } catch (err) {
      console.error(`[autoGen] Error generating for slate ${slate.id}:`, String(err));
      throw err; // Re-throw so the route handler catches it with full stack
    }
  }

  return allJobs;
}
