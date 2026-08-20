import { db } from "@/db/drizzle";
import * as schema from "@/db/schema";

type Insertable<T> = T extends { id: string } ? Omit<T, "id"> : never;
type Selectable<T> = any;

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
  const res = await safeQuery(
    db.select().from(schema.families).where({ id }).first()
  );
  return res as Selectable<any> | null;
}

export async function getFamilyBySlug(slug: string) {
  if (!db) return null;
  const res = await safeQuery(
    db.select().from(schema.families).where({ slug }).first()
  );
  return res as Selectable<any> | null;
}

export async function createFamily(data: Insertable<any>) {
  if (!db) return null;
  const res = await safeQuery(
    db.insert(schema.families).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
}

export async function updateFamily(id: string, data: Partial<any>) {
  if (!db) return null;
  const res = await safeQuery(
    db.update(schema.families).set(data).where({ id }).returning("*")
  );
  return (res as any[])?.[0] || null;
}

// ─── Users ──────────────────────────────────────────────────────────

export async function getUserById(id: string) {
  if (!db) return null;
  const res = await safeQuery(
    db.select().from(schema.users).where({ id }).first()
  );
  return res as Selectable<any> | null;
}

export async function getUserByEmail(email: string) {
  if (!db) return null;
  const res = await safeQuery(
    db.select().from(schema.users).where({ email }).first()
  );
  return res as Selectable<any> | null;
}

export async function updateUserPoints(id: string, points: number) {
  if (!db) return null;
  const res = await safeQuery(
    db.update(schema.users).set({ pointsTotal: points }).where({ id }).returning("*")
  );
  return (res as any[])?.[0] || null;
}

// ─── Teams ──────────────────────────────────────────────────────────

export async function getTeamsByFamily(familyId: string) {
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.teams).where({ familyId })
  );
  return (res as any[]) || [];
}

export async function createTeam(data: Insertable<any>) {
  if (!db) return null;
  const res = await safeQuery(
    db.insert(schema.teams).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
}

// ─── Tasks ──────────────────────────────────────────────────────────

export async function getTasksByFamily(familyId: string) {
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.tasks).where({ familyId })
  );
  return (res as any[]) || [];
}

export async function getTaskById(id: string) {
  if (!db) return null;
  const res = await safeQuery(
    db.select().from(schema.tasks).where({ id }).first()
  );
  return res as Selectable<any> | null;
}

export async function createTask(data: Insertable<any>) {
  if (!db) return null;
  const res = await safeQuery(
    db.insert(schema.tasks).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
}

export async function updateTask(id: string, data: Partial<any>) {
  if (!db) return null;
  const res = await safeQuery(
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
  const res = await safeQuery(
    db.select().from(schema.subtasks).where({ taskId })
  );
  return (res as any[]) || [];
}

export async function createSubtask(data: Insertable<any>) {
  if (!db) return null;
  const res = await safeQuery(
    db.insert(schema.subtasks).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
}

// ─── Slates ─────────────────────────────────────────────────────────

export async function getSlatesByFamily(familyId: string) {
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.slates).where({ familyId })
  );
  return (res as any[]) || [];
}

export async function getSlateById(id: string) {
  if (!db) return null;
  const res = await safeQuery(
    db.select().from(schema.slates).where({ id }).first()
  );
  return res as Selectable<any> | null;
}

// ─── Jobs ───────────────────────────────────────────────────────────

export async function getJobsByList(listId: string) {
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.jobs).where({ listId })
  );
  return (res as any[]) || [];
}

export async function getJobsByFamily(familyId: string) {
  if (!db) return [];
  // Stub for now — jobs don't have a direct family_id relationship
  const res = await safeQuery(
    db.select().from(schema.jobs).where({ listId: '' })
  );
  return (res as any[]) || [];
}

export async function getJobById(id: string) {
  if (!db) return null;
  const res = await safeQuery(
    db.select().from(schema.jobs).where({ id }).first()
  );
  return res as Selectable<any> | null;
}

export async function createJob(data: Insertable<any>) {
  if (!db) return null;
  const res = await safeQuery(
    db.insert(schema.jobs).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
}

export async function updateJob(id: string, data: Partial<any>) {
  if (!db) return null;
  const res = await safeQuery(
    db.update(schema.jobs).set(data).where({ id }).returning("*")
  );
  return (res as any[])?.[0] || null;
}

// ─── Lists ──────────────────────────────────────────────────────────

export async function getListsByFamily(familyId: string) {
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.lists).where({ familyId })
  );
  return (res as any[]) || [];
}

export async function createList(data: Insertable<any>) {
  if (!db) return null;
  const res = await safeQuery(
    db.insert(schema.lists).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
}

// ─── Comments & History ─────────────────────────────────────────────

export async function getCommentsByJob(jobId: string) {
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.comments).where({ jobId })
  );
  return (res as any[]) || [];
}

export async function addComment(data: Insertable<any>) {
  if (!db) return null;
  const res = await safeQuery(
    db.insert(schema.comments).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
}

// ─── Reports ────────────────────────────────────────────────────────

export async function getReportsByFamily(familyId: string) {
  if (!db) return [];
  const res = await safeQuery(
    db.select().from(schema.reports).where({ familyId })
  );
  return (res as any[]) || [];
}

// ─── Invites ────────────────────────────────────────────────────────

export async function getInviteByCode(code: string) {
  if (!db) return null;
  const res = await safeQuery(
    db.select().from(schema.invites).where({ code }).first()
  );
  return res as Selectable<any> | null;
}

export async function createInvite(data: Insertable<any>) {
  if (!db) return null;
  const res = await safeQuery(
    db.insert(schema.invites).values(data).returning("*")
  );
  return (res as any[])?.[0] || null;
}
