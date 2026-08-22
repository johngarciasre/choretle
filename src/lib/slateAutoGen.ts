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
  const {
    getSlateTasksBySlate,
    getRotationsBySlate,
    getListBySlateAndDate,
    createList,
    createListTask,
    createJob,
  } = await import("@/lib/db/service");

  // Skip if list already exists for this slate/date
  const existingList = await getListBySlateAndDate(slateId, targetDate);
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

  // Get slate tasks and rotations
  const slateTasks = await getSlateTasksBySlate(slateId);
  if (!slateTasks || slateTasks.length === 0) return [];

  const rotations = await getRotationsBySlate(slateId);

  // Determine assignments
  let assignments: Map<string, string[]> = new Map();

  if (rotations && rotations.length > 0) {
    assignments = calculateRotationAssignment(slateTasks, rotations, targetDate);
  } else {
    // No rotations configured — assign all tasks without specific user
    for (const slateTask of slateTasks) {
      const job = await createJob({
        listId: list.id,
        slateTaskId: slateTask.id,
        name: slateTask.name || "Untitled Task",
        points: slateTask.pointsOverride || 0,
        status: "todo",
        dueDate: targetDate,
      });

      if (job?.id) {
        await createListTask({
          listId: list.id,
          slateTaskId: slateTask.id,
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
      const slateTask = slateTasks.find((st: any) => st.id === slateTaskId);
      if (!slateTask) continue;

      const job = await createJob({
        listId: list.id,
        slateTaskId,
        assignedTo: userId,
        name: slateTask.name || "Untitled Task",
        points: slateTask.pointsOverride || 0,
        status: "todo",
        dueDate: targetDate,
      });

      if (job?.id) {
        await createListTask({
          listId: list.id,
          slateTaskId,
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
  const slates = await getSlatesByFamily(familyId);

  if (!slates || slates.length === 0) return [];

  // Find active slates using pure functions from points.ts
  const activeSlates = slates.filter((s: any) => shouldGenerateList(s, date));
  const allJobs: GeneratedJob[] = [];

  for (const slate of activeSlates) {
    const jobs = await generateJobsFromSlate(slate.id, familyId, date);
    allJobs.push(...jobs);
  }

  return allJobs;
}
