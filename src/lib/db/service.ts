import { initDb, getDb } from "@/db";

let db: any = null;

async function ensureDb(): Promise<any> {
  if (db) return db;
  const raw = getDb();
  if (raw) {
    db = raw;
    return raw;
  }
  db = await initDb();
  return getDb() || db;
}

function nowISO(): string { return new Date().toISOString(); }

export async function canTransition(currentStatus: string, nextStatus: string): Promise<boolean> {
  const validTransitions: Record<string, string[]> = {
    todo: ["doing", "done"],
    doing: ["done", "todo", "under_review"],
    under_review: ["doing", "done"],
  };
  return (validTransitions[currentStatus] || []).includes(nextStatus);
}

export async function getValidNextStatuses(status: string): Promise<string[]> {
  const validTransitions: Record<string, string[]> = {
    todo: ["doing", "done"],
    doing: ["done", "todo", "under_review"],
    under_review: ["doing", "done"],
  };
  return validTransitions[status] || [];
}

export async function calculateJobPoints(jobData: any): Promise<number> {
  if (!jobData) return 0;
  const basePoints = jobData.points || 0;
  let multiplier = 1;
  if (jobData.status === "done") multiplier = 1.5;
  return Math.round(basePoints * multiplier);
}

// ─── Families ────────────────────────────────────────────────────────
export async function getHouseholdById(id: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const res = await rawDb.prepare(`SELECT * FROM households WHERE id = ?`).get(id) as any;
  return res || null;
}

export async function getHouseholdBySlug(slug: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const res = await rawDb.prepare(`SELECT * FROM households WHERE slug = ?`).get(slug) as any;
  return res || null;
}

export async function createHousehold(data: any) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const now = nowISO();
  const id = `household-${crypto.randomUUID()}`;
  await rawDb.prepare(
    `INSERT INTO households (id, name, slug, logo_url, timezone, week_start_day, theme, teams_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 'America/New_York', 0, 'coral', false, ?, ?)`
  ).run(id, data.name, data.slug, null, now, now);
  const res = await rawDb.prepare(`SELECT * FROM households WHERE id = ?`).get(id) as any;
  return res || null;
}

export async function updateHousehold(id: string, data: Partial<any>) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const updates: string[] = ["updated_at = ?"];
  const values: any[] = [nowISO()];
  if (data.name !== undefined) { updates.push("name = ?"); values.push(data.name); }
  if (data.logo_url !== undefined) { updates.push("logo_url = ?"); values.push(data.logo_url); }
  if (data.week_start_day !== undefined) { updates.push("week_start_day = ?"); values.push(data.week_start_day); }
  if (data.teams_enabled !== undefined) { updates.push("teams_enabled = ?"); values.push(Boolean(data.teams_enabled)); }
  values.push(id);
  await rawDb.prepare(`UPDATE households SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  const res = await rawDb.prepare(`SELECT * FROM households WHERE id = ?`).get(id) as any;
  return res || null;
}

// ─── Users ──────────────────────────────────────────────────────────
export async function getUserById(id: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const res = await rawDb.prepare(`SELECT id, email, name, avatar_url, birth_year, created_at, updated_at FROM users WHERE id = ?`).get(id) as any;
  return res || null;
}

export async function getUserByEmail(email: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const res = await rawDb.prepare(`SELECT id, email, name, avatar_url, birth_year, created_at, updated_at FROM users WHERE email = ?`).get(email) as any;
  return res || null;
}

export async function updateUserPoints(id: string, points: number) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  await rawDb.prepare(`UPDATE memberships SET points_total = ? WHERE user_id = ?`).run(points, id);
  const res = await rawDb.prepare(`SELECT id, email, name, avatar_url, birth_year, created_at, updated_at FROM users WHERE id = ?`).get(id) as any;
  return res || null;
}

// ─── Profile ────────────────────────────────────────────────────────
export async function getProfileByUserId(userId: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const user = await rawDb.prepare(`SELECT u.id, u.email, u.name, u.avatar_url, u.birth_year, m.household_id, m.role, m.points_total FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.user_id = ? ORDER BY m.joined_at ASC LIMIT 1`).get(userId) as any;
  if (!user) return null;

  const completedJobs = await rawDb.prepare(
    `SELECT j.*, t.name as task_name, t.points as task_points FROM jobs j LEFT JOIN tasks t ON j.slate_task_id = t.id WHERE j.assigned_to = ? AND j.status = 'done' ORDER BY j.completed_at DESC`
  ).all(userId) as any[];

  const streakCount = (completedJobs || []).reduce((acc: number, job: any) => {
    if (!job.completed_at) return acc;
    const prevDate = new Date(job.completed_at);
    const currDate = new Date(prevDate);
    currDate.setDate(currDate.getDate() + 1);
    // Simple streak: consecutive days
    return acc + 1;
  }, 0);

  return {
    ...user,
    completedJobs: completedJobs || [],
    streakCount,
    totalPoints: user.points_total || 0,
  };
}

// ─── Tasks ──────────────────────────────────────────────────────────
export async function getTasksByHousehold(householdId: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return [];
  const tasks = await rawDb.prepare(`SELECT * FROM tasks WHERE household_id = ? AND is_active = 1 ORDER BY name`).all(householdId) as any[];
  return tasks || [];
}

export async function getTaskById(id: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const res = await rawDb.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as any;
  return res || null;
}

export async function createTask(data: any) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const now = nowISO();
  const taskId = `task-${crypto.randomUUID()}`;
  await rawDb.prepare(
    `INSERT INTO tasks (id, household_id, name, description, points, icon, archtype, is_active, verify_required, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, 'job', 1, 0, ?, ?)`
  ).run(taskId, data.household_id, data.name, data.description || null, data.points || 0, now, now);
  const res = await rawDb.prepare(`SELECT * FROM tasks WHERE id = ?`).get(taskId) as any;
  return res || null;
}

export async function updateTask(id: string, data: Partial<any>) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const updates: string[] = ["updated_at = ?"];
  const values: any[] = [nowISO()];
  if (data.name !== undefined) { updates.push("name = ?"); values.push(data.name); }
  if (data.description !== undefined) { updates.push("description = ?"); values.push(data.description); }
  if (data.points !== undefined) { updates.push("points = ?"); values.push(data.points); }
  if (data.icon !== undefined) { updates.push("icon = ?"); values.push(data.icon); }
  values.push(id);
  await rawDb.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  const res = await rawDb.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as any;
  return res || null;
}

export async function deleteTask(id: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return false;
  await rawDb.prepare(`UPDATE tasks SET is_active = 0 WHERE id = ?`).run(id);
  return true;
}

// ─── Subtasks ────────────────────────────────────────────────────────
export async function getSubtasksByTask(taskId: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return [];
  const subtasks = await rawDb.prepare(`SELECT * FROM subtasks WHERE task_id = ? ORDER BY "order"`).all(taskId) as any[];
  return subtasks || [];
}

export async function createSubtask(data: any) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const now = nowISO();
  const id = `subtask-${crypto.randomUUID()}`;
  await rawDb.prepare(
    `INSERT INTO subtasks (id, household_id, task_id, name, points, "order", created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.household_id, data.task_id, data.name, data.points || 0, data.order || 0, now);
  const res = await rawDb.prepare(`SELECT * FROM subtasks WHERE id = ?`).get(id) as any;
  return res || null;
}

// ─── Slates ─────────────────────────────────────────────────────────
export async function getSlatesByHousehold(householdId: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return [];
  const slates = await rawDb.prepare(`SELECT * FROM slates WHERE household_id = ? AND is_active = 1 ORDER BY name`).all(householdId) as any[];
  return slates || [];
}

export async function getSlateById(id: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const res = await rawDb.prepare(`SELECT * FROM slates WHERE id = ?`).get(id) as any;
  return res || null;
}

export async function createSlate(data: any) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const now = nowISO();
  const id = `slate-${crypto.randomUUID()}`;
  await rawDb.prepare(
    `INSERT INTO slates (id, household_id, name, description, room_location, frequency, interval, default_due_date_offset, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, 'weekly', 1, 0, 1, ?, ?)`
  ).run(id, data.household_id, data.name, data.description || null, now, now);
  const res = await rawDb.prepare(`SELECT * FROM slates WHERE id = ?`).get(id) as any;
  return res || null;
}

export async function updateSlate(id: string, data: Partial<any>) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const updates: string[] = ["updated_at = ?"];
  const values: any[] = [nowISO()];
  if (data.name !== undefined) { updates.push("name = ?"); values.push(data.name); }
  if (data.description !== undefined) { updates.push("description = ?"); values.push(data.description); }
  if (data.room_location !== undefined) { updates.push("room_location = ?"); values.push(data.room_location); }
  if (data.frequency !== undefined) { updates.push("frequency = ?"); values.push(data.frequency); }
  if (data.interval !== undefined) { updates.push("interval = ?"); values.push(data.interval); }
  values.push(id);
  await rawDb.prepare(`UPDATE slates SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  const res = await rawDb.prepare(`SELECT * FROM slates WHERE id = ?`).get(id) as any;
  return res || null;
}

export async function deleteSlate(id: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return false;
  await rawDb.prepare(`UPDATE slates SET is_active = 0 WHERE id = ?`).run(id);
  return true;
}

// ─── Lists ──────────────────────────────────────────────────────────
export async function getListsBySlate(slateId: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return [];
  const lists = await rawDb.prepare(`SELECT * FROM lists WHERE slate_id = ? ORDER BY start_date DESC`).all(slateId) as any[];
  return lists || [];
}

export async function createList(data: any) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const now = nowISO();
  const id = `list-${crypto.randomUUID()}`;
  try {
    await rawDb.prepare(
      `INSERT INTO lists (id, slate_id, household_id, name, start_date, end_date, period, status, created_at) VALUES (?, ?, ?, ?, ?, NULL, 'day', 'active', ?)`
    ).run(id, data.slateId, data.householdId, data.name, data.startDate?.toISOString() || new Date().toISOString(), now);
  } catch (err) {
    // A concurrent generation may have created the same slate/day list first;
    // the unique index rejects the duplicate, so return the existing row.
    const existing = await rawDb.prepare(
      `SELECT * FROM lists WHERE slate_id = ? AND start_date::date = ?::date LIMIT 1`
    ).get(data.slateId, data.startDate?.toISOString() || new Date().toISOString()) as any;
    if (existing) return existing;
    throw err;
  }
  const res = await rawDb.prepare(`SELECT * FROM lists WHERE id = ?`).get(id) as any;
  return res || null;
}

// ─── Tags ──────────────────────────────────────────────────────────
export async function getTagsByHousehold(householdId: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return [];
  const tags = await rawDb.prepare(`SELECT * FROM tags WHERE household_id = ? ORDER BY name`).all(householdId) as any[];
  return tags || [];
}

export async function createTag(data: any) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const now = nowISO();
  const id = `tag-${crypto.randomUUID()}`;
  await rawDb.prepare(
    `INSERT INTO tags (id, household_id, name, color, created_at, updated_at) VALUES (?, ?, ?, 'blue', ?, ?)`
  ).run(id, data.household_id, data.name, now, now);
  const res = await rawDb.prepare(`SELECT * FROM tags WHERE id = ?`).get(id) as any;
  return res || null;
}

export async function updateTag(id: string, data: Partial<any>) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const updates: string[] = ["updated_at = ?"];
  const values: any[] = [nowISO()];
  if (data.name !== undefined) { updates.push("name = ?"); values.push(data.name); }
  if (data.color !== undefined) { updates.push("color = ?"); values.push(data.color); }
  values.push(id);
  await rawDb.prepare(`UPDATE tags SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  const res = await rawDb.prepare(`SELECT * FROM tags WHERE id = ?`).get(id) as any;
  return res || null;
}

export async function deleteTag(id: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return false;
  await rawDb.prepare(`DELETE FROM task_tags WHERE tag_id = ?`).run(id);
  await rawDb.prepare(`DELETE FROM tags WHERE id = ?`).run(id);
  return true;
}

// ─── Invites ──────────────────────────────────────────────────────
export async function getInviteByCode(code: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const invite = await rawDb.prepare(`SELECT * FROM invites WHERE code = ?`).get(code) as any;
  return invite || null;
}

export async function createInvite(data: any) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const now = data.created_at || nowISO();
  const updated_at = data.updated_at || now;
  const expires_at = data.expires_at ? new Date(data.expires_at).toISOString() : null;
  await rawDb.prepare(
    `INSERT INTO invites (id, household_id, code, role, expires_at, used, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(data.id, data.householdId, data.code, data.role || "child", expires_at, data.used || 0, now, updated_at);
  const res = await rawDb.prepare(`SELECT * FROM invites WHERE id = ?`).get(data.id) as any;
  return res || null;
}

export async function deleteInvite(id: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return false;
  await rawDb.prepare(`DELETE FROM invites WHERE id = ?`).run(id);
  return true;
}

// ─── Job Status Transitions ──────────────────────────────────────
export async function updateJobStatus(jobId: string, newStatus: string, userId: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const now = nowISO();

  const job = await rawDb.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as any;
  if (!job) return null;

  const validTransitions: Record<string, string[]> = {
    todo: ["doing", "done"],
    doing: ["done", "todo", "under_review"],
    under_review: ["doing", "done"],
  };

  if (!validTransitions[job.status]?.includes(newStatus)) {
    return { error: `Invalid transition from ${job.status} to ${newStatus}` };
  }

  const historyId = `jh-${crypto.randomUUID()}`;
  await rawDb.prepare(
    `INSERT INTO job_history (id, job_id, action, details, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(historyId, jobId, `status_${job.status}_to_${newStatus}`, `Status changed from ${job.status} to ${newStatus}`, userId, now);

  const updateFields: string[] = ["status = ?", "updated_at = ?"];
  const values: any[] = [newStatus, now];
  if (newStatus === "done") { updateFields.push("completed_at = ?"); values.push(now); }
  values.push(jobId);
  await rawDb.prepare(`UPDATE jobs SET ${updateFields.join(", ")} WHERE id = ?`).run(...values);

  const updatedJob = await rawDb.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as any;
  return updatedJob || null;
}

// ─── List Tasks ──────────────────────────────────────────────────
export async function getListBySlateAndDate(slateId: string, date: Date) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const startStr = date.toISOString().split("T")[0];
  const res = await rawDb.prepare(
    `SELECT * FROM lists WHERE slate_id = ? AND start_date::date <= ?::date ORDER BY start_date DESC LIMIT 1`
  ).get(slateId, startStr) as any;
  return res || null;
}

/** Check if a list exists for the exact calendar day of the target date. */
export async function getListBySlateAndExactDate(slateId: string, date: Date) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const startStr = date.toISOString().split("T")[0];
  const res = await rawDb.prepare(
    `SELECT * FROM lists WHERE slate_id = ? AND start_date::date = ?::date LIMIT 1`
  ).get(slateId, startStr) as any;
  return res || null;
}

export async function getRotationsBySlate(slateId: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return [];
  const rotations = await rawDb.prepare(`SELECT * FROM rotations WHERE slate_id = ?`).all(slateId) as any[];
  return rotations || [];
}

export async function createListTask(data: any) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const id = `ltask-${crypto.randomUUID()}`;
  await rawDb.prepare(
    `INSERT INTO list_tasks (id, list_id, slate_task_id, points_override) VALUES (?, ?, ?, ?)`
  ).run(id, data.listId, data.slateTaskId, data.pointsOverride || 0);
  const res = await rawDb.prepare(`SELECT * FROM list_tasks WHERE id = ?`).get(id) as any;
  return res || null;
}

export async function createJob(data: any) {
  const rawDb = await ensureDb();
  if (!rawDb) return null;
  const now = nowISO();
  const id = `job-${crypto.randomUUID()}`;
  await rawDb.prepare(
    `INSERT INTO jobs (id, list_id, slate_task_id, assigned_to, name, points, status, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?)`
  ).run(id, data.listId, data.slateTaskId, data.assignedTo || null, data.name || "", data.points || 0,
    data.dueDate?.toISOString() || now, now, now);
  const res = await rawDb.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as any;
  return res || null;
}

export async function resolveSlateTaskSet(slateId: string) {
  const rawDb = await ensureDb();
  if (!rawDb) return [];

  // Fetch explicit slate tasks (join to get task name and schedule).
  // slateTaskId is the slate_tasks row id — that is what jobs.slate_task_id stores.
  const explicitTasksResult = await rawDb.prepare(
    `SELECT st.id as slate_task_id, st.task_id, st.points_override, st."order", t.name as task_name, t.schedule as task_schedule FROM slate_tasks st LEFT JOIN tasks t ON st.task_id = t.id WHERE st.slate_id = ?`
  ).all(slateId) as any[];

  // Fetch slate's tags
  const slateTagIds = await rawDb.prepare(`SELECT tag_id FROM slate_tags WHERE slate_id = ?`).all(slateId) as any[];
  const tagIdList = (slateTagIds || []).map((t: any) => t.tag_id);

  // If no explicit tasks and no tags, return empty
  if ((explicitTasksResult?.length || 0) === 0 && tagIdList.length === 0) return [];

  // Fetch tag-matched tasks
  const tagMatchedTasks: Array<{ taskId: string; taskName: string; points: number }> = [];
  if (tagIdList.length > 0) {
    const placeholders = tagIdList.map(() => "?").join(",");
    const matched = await rawDb.prepare(
      `SELECT DISTINCT t.id as task_id, t.name as task_name, t.points FROM tasks t INNER JOIN task_tags tt ON t.id = tt.task_id WHERE tt.tag_id IN (${placeholders})`
    ).all(...tagIdList) as any[];
    if (matched) tagMatchedTasks.push(...matched);
  }

  // Dedupe by taskId: explicit rows take priority over tag-matched
  const result = new Map<string, any>();
  for (const task of (explicitTasksResult || [])) {
    // If points_override is NULL, look up the task's default points
    let pointsOverride = task.points_override;
    if (pointsOverride === null || pointsOverride === undefined) {
      const taskRow = await rawDb.prepare(`SELECT points FROM tasks WHERE id = ?`).get(task.task_id) as any;
      pointsOverride = taskRow?.points || 0;
    }
    result.set(task.task_id, {
      slateTaskId: task.slate_task_id,
      taskId: task.task_id,
      taskName: task.task_name,
      pointsOverride,
      order: task.order,
      isExplicit: true,
      taskSchedule: task.task_schedule,
    });
  }
  for (const task of tagMatchedTasks) {
    if (result.has(task.taskId)) continue;
    // Tag-matched tasks have no slate_tasks row yet. Create a stable one so
    // jobs.slate_task_id can always be joined back to a slate task.
    const slateTaskId = `stask-${slateId}-${task.taskId}`;
    await rawDb.prepare(
      `INSERT INTO slate_tasks (id, slate_id, task_id, points_override, "order") VALUES (?, ?, ?, NULL, 0)`
    ).run(slateTaskId, slateId, task.taskId);
    result.set(task.taskId, {
      slateTaskId,
      taskId: task.taskId,
      taskName: task.taskName,
      pointsOverride: task.points,
      order: 0,
      isExplicit: false,
      taskSchedule: null,
    });
  }

  const slateTasks = Array.from(result.values());
  slateTasks.sort((a: any, b: any) => {
    if (a.isExplicit && !b.isExplicit) return -1;
    if (!a.isExplicit && b.isExplicit) return 1;
    return a.order - b.order;
  });

  return slateTasks;
}
