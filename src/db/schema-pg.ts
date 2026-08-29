import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";

export const families = pgTable("families", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  logoUrl: text("logo_url"),
  timezone: text("timezone").default("America/New_York").notNull(),
  weekStartDay: integer("week_start_day").default(0).notNull(),
  theme: text("theme").default("coral").notNull(),
  teamsEnabled: boolean("teams_enabled").default(false).notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const routines = pgTable("routines", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  weekStartDay: integer("week_start_day").default(0).notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  role: text("role").default("child").notNull(),
  familyId: text("family_id"),
  pointsTotal: integer("points_total").default(0).notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at").notNull(),
});

export const teamMembers = pgTable("team_members", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull(),
  userId: text("user_id").notNull(),
  joinedAt: timestamp("joined_at").notNull(),
});

export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  points: integer("points").default(0).notNull(),
  icon: text("icon"),
  archtype: text("archtype").default("job").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  verifyRequired: boolean("verify_required").default(false).notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const subtasks = pgTable("subtasks", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  taskId: text("task_id"),
  name: text("name").notNull(),
  points: integer("points").default(0).notNull(),
  order: integer("order").default(0).notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const slates = pgTable("slates", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  roomLocation: text("room_location"),
  frequency: text("frequency").default("weekly").notNull(),
  interval: integer("interval").default(1).notNull(),
  defaultDueDateOffset: integer("default_due_date_offset").default(0).notNull(),
  subtaskMinRequired: integer("subtask_min_required"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const slateTasks = pgTable("slate_tasks", {
  id: text("id").primaryKey(),
  slateId: text("slate_id").notNull(),
  taskId: text("task_id").notNull(),
  pointsOverride: integer("points_override"),
  order: integer("order").default(0).notNull(),
});

export const lists = pgTable("lists", {
  id: text("id").primaryKey(),
  slateId: text("slate_id").notNull(),
  familyId: text("family_id").notNull(),
  name: text("name").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  period: text("period").default("day").notNull(),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const listTasks = pgTable("list_tasks", {
  id: text("id").primaryKey(),
  listId: text("list_id").notNull(),
  slateTaskId: text("slate_task_id").notNull(),
  pointsOverride: integer("points_override"),
});

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  listId: text("list_id").notNull(),
  slateTaskId: text("slate_task_id"),
  listTaskId: text("list_task_id"),
  assignedTo: text("assigned_to"),
  name: text("name").notNull(),
  description: text("description"),
  points: integer("points").default(0).notNull(),
  status: text("status").default("todo").notNull(),
  verifyRequired: boolean("verify_required").default(false).notNull(),
  reviewedAt: timestamp("reviewed_at"),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").default(new Date()).notNull(),
});

export const jobSubtasks = pgTable("job_subtasks", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  subtaskId: text("subtask_id").notNull(),
  completedAt: timestamp("completed_at"),
  pointsAwarded: integer("points_awarded").default(0).notNull(),
});

export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  userId: text("user_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const jobHistory = pgTable("job_history", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  userId: text("user_id"),
  createdAt: timestamp("created_at").notNull(),
});

export const reports = pgTable("reports", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  type: text("type").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end"),
  data: text("data"),
  createdAt: timestamp("created_at").notNull(),
});

export const rotations = pgTable("rotations", {
  id: text("id").primaryKey(),
  slateId: text("slate_id").notNull(),
  userId: text("user_id").notNull(),
  order: integer("order").default(0).notNull(),
  intervalDays: integer("interval_days").default(7).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export const swapMeet = pgTable("swap_meet", {
  id: text("id").primaryKey(),
  slateId: text("slate_id").notNull(),
  sharingFamilyId: text("sharing_family_id").notNull(),
  requestedBy: text("requested_by"),
  status: text("status").default("pending").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const tags = pgTable("tags", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  name: text("name").notNull(),
  color: text("color"),
  createdAt: timestamp("created_at").notNull(),
});

export const taskTags = pgTable("task_tags", {
  id: text("id").primaryKey(),
  tagId: text("tag_id").notNull(),
  taskId: text("task_id").notNull(),
});

export const slateTags = pgTable("slate_tags", {
  id: text("id").primaryKey(),
  slateId: text("slate_id").notNull(),
  tagId: text("tag_id").notNull(),
});

export const photos = pgTable("photos", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  objectType: text("object_type").notNull(),
  objectId: text("object_id").notNull(),
  url: text("url").notNull(),
  title: text("title"),
  type: text("type").default("probative").notNull(),
  isProbative: boolean("is_probative").default(false).notNull(),
  order: integer("order").default(0).notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const reviews = pgTable("reviews", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  familyId: text("family_id").notNull(),
  reviewerId: text("reviewer_id"),
  approvedBy: text("approved_by"),
  status: text("status").default("pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const invites = pgTable("invites", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  code: text("code").unique().notNull(),
  email: text("email"),
  role: text("role").default("child").notNull(),
  expiresAt: timestamp("expires_at"),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").notNull(),
});
