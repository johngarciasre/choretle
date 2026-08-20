import { sql } from "drizzle-orm";
import { pgTable, uuid, text, boolean, timestamp, integer, varchar } from "drizzle-orm/pg-core";

// ─── Families & Teams ───────────────────────────────────────────────

export const families = pgTable("families", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).unique().notNull(),
  logoUrl: text("logo_url"),
  timezone: varchar("timezone", { length: 64 }).default("America/New_York").notNull(),
  weekStartDay: integer("week_start_day").default(0).notNull(),
  teamsEnabled: boolean("teams_enabled").default(false).notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
});

export const routines = pgTable("routines", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  familyId: uuid("family_id").notNull(),
  weekStartDay: integer("week_start_day").default(0).notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
});

// ─── Users ──────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  avatarUrl: text("avatar_url"),
  role: varchar("role", { length: 20 }).default("child").notNull(),
  familyId: uuid("family_id"),
  pointsTotal: integer("points_total").default(0).notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
});

export const teams = pgTable("teams", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  familyId: uuid("family_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const teamMembers = pgTable("team_members", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  teamId: uuid("team_id").notNull(),
  userId: uuid("user_id").notNull(),
  joinedAt: timestamp("joined_at").default(sql`now()`).notNull(),
});

// ─── Tasks & Subtasks ───────────────────────────────────────────────

export const tasks = pgTable("tasks", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  familyId: uuid("family_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  points: integer("points").default(0).notNull(),
  icon: varchar("icon", { length: 50 }),
  archtype: varchar("archtype", { length: 50 }).default("job").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
});

export const subtasks = pgTable("subtasks", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  taskId: uuid("task_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  points: integer("points").default(0).notNull(),
  order: integer("order").default(0).notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

// ─── Slates & Lists ─────────────────────────────────────────────────

export const slates = pgTable("slates", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  familyId: uuid("family_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  roomLocation: varchar("room_location", { length: 100 }),
  frequency: varchar("frequency", { length: 20 }).default("weekly").notNull(),
  interval: integer("interval").default(1).notNull(),
  defaultDueDateOffset: integer("default_due_date_offset").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
});

export const slateTasks = pgTable("slate_tasks", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  slateId: uuid("slate_id").notNull(),
  taskId: uuid("task_id").notNull(),
  pointsOverride: integer("points_override"),
  order: integer("order").default(0).notNull(),
});

export const lists = pgTable("lists", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  slateId: uuid("slate_id").notNull(),
  familyId: uuid("family_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  period: varchar("period", { length: 10 }).default("day").notNull(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const listTasks = pgTable("list_tasks", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  listId: uuid("list_id").notNull(),
  slateTaskId: uuid("slate_task_id").notNull(),
  pointsOverride: integer("points_override"),
});

// ─── Jobs ───────────────────────────────────────────────────────────

export const jobs = pgTable("jobs", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  listId: uuid("list_id").notNull(),
  slateTaskId: uuid("slate_task_id"),
  listTaskId: uuid("list_task_id"),
  assignedTo: uuid("assigned_to"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  points: integer("points").default(0).notNull(),
  status: varchar("status", { length: 20 }).default("todo").notNull(),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
});

export const jobSubtasks = pgTable("job_subtasks", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  jobId: uuid("job_id").notNull(),
  subtaskId: uuid("subtask_id").notNull(),
  completedAt: timestamp("completed_at"),
  pointsAwarded: integer("points_awarded").default(0).notNull(),
});

// ─── Comments & History ─────────────────────────────────────────────

export const comments = pgTable("comments", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  jobId: uuid("job_id").notNull(),
  userId: uuid("user_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const jobHistory = pgTable("job_history", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  jobId: uuid("job_id").notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  details: text("details"),
  userId: uuid("user_id"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

// ─── Reports ────────────────────────────────────────────────────────

export const reports = pgTable("reports", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  familyId: uuid("family_id").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end"),
  data: text("data"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

// ─── Rotation ───────────────────────────────────────────────────────

export const rotations = pgTable("rotations", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  slateId: uuid("slate_id").notNull(),
  userId: uuid("user_id").notNull(),
  order: integer("order").default(0).notNull(),
  intervalDays: integer("interval_days").default(7).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

// ─── Swap Meet ──────────────────────────────────────────────────────

export const swapMeet = pgTable("swap_meet", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  slateId: uuid("slate_id").notNull(),
  sharingFamilyId: uuid("sharing_family_id").notNull(),
  requestedBy: uuid("requested_by"),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

// ─── Invites ────────────────────────────────────────────────────────

export const invites = pgTable("invites", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  familyId: uuid("family_id").notNull(),
  code: varchar("code", { length: 20 }).unique().notNull(),
  email: varchar("email", { length: 255 }),
  role: varchar("role", { length: 20 }).default("child").notNull(),
  expiresAt: timestamp("expires_at"),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});
