import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const families = sqliteTable("families", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  logoUrl: text("logo_url"),
  timezone: text("timezone").default("America/New_York").notNull(),
  weekStartDay: integer("week_start_day").default(0).notNull(),
  theme: text("theme").default("coral").notNull(),
  teamsEnabled: integer("teams_enabled").default(0).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const routines = sqliteTable("routines", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  weekStartDay: integer("week_start_day").default(0).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  role: text("role").default("child").notNull(),
  familyId: text("family_id"),
  pointsTotal: integer("points_total").default(0).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  createdAt: text("created_at").notNull(),
});

export const teamMembers = sqliteTable("team_members", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull(),
  userId: text("user_id").notNull(),
  joinedAt: text("joined_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  points: integer("points").default(0).notNull(),
  icon: text("icon"),
  archtype: text("archtype").default("job").notNull(),
  isActive: integer("is_active").default(1).notNull(),
  verifyRequired: integer("verify_required").default(0).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const subtasks = sqliteTable("subtasks", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  taskId: text("task_id"),
  name: text("name").notNull(),
  points: integer("points").default(0).notNull(),
  order: integer("order").default(0).notNull(),
  createdAt: text("created_at").notNull(),
});

export const slates = sqliteTable("slates", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  roomLocation: text("room_location"),
  frequency: text("frequency").default("weekly").notNull(),
  interval: integer("interval").default(1).notNull(),
  defaultDueDateOffset: integer("default_due_date_offset").default(0).notNull(),
  subtaskMinRequired: integer("subtask_min_required"),
  isActive: integer("is_active").default(1).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const slateTasks = sqliteTable("slate_tasks", {
  id: text("id").primaryKey(),
  slateId: text("slate_id").notNull(),
  taskId: text("task_id").notNull(),
  pointsOverride: integer("points_override"),
  order: integer("order").default(0).notNull(),
});

export const lists = sqliteTable("lists", {
  id: text("id").primaryKey(),
  slateId: text("slate_id").notNull(),
  familyId: text("family_id").notNull(),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  period: text("period").default("day").notNull(),
  status: text("status").default("active").notNull(),
  createdAt: text("created_at").notNull(),
});

export const listTasks = sqliteTable("list_tasks", {
  id: text("id").primaryKey(),
  listId: text("list_id").notNull(),
  slateTaskId: text("slate_task_id").notNull(),
  pointsOverride: integer("points_override"),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  listId: text("list_id").notNull(),
  slateTaskId: text("slate_task_id"),
  listTaskId: text("list_task_id"),
  assignedTo: text("assigned_to"),
  name: text("name").notNull(),
  description: text("description"),
  points: integer("points").default(0).notNull(),
  status: text("status").default("todo").notNull(),
  verifyRequired: integer("verify_required").default(0).notNull(),
  reviewedAt: text("reviewed_at"),
  dueDate: text("due_date"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const jobSubtasks = sqliteTable("job_subtasks", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  subtaskId: text("subtask_id").notNull(),
  completedAt: text("completed_at"),
  pointsAwarded: integer("points_awarded").default(0).notNull(),
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  userId: text("user_id").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

export const jobHistory = sqliteTable("job_history", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  userId: text("user_id"),
  createdAt: text("created_at").notNull(),
});

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  type: text("type").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end"),
  data: text("data"),
  createdAt: text("created_at").notNull(),
});

export const rotations = sqliteTable("rotations", {
  id: text("id").primaryKey(),
  slateId: text("slate_id").notNull(),
  userId: text("user_id").notNull(),
  order: integer("order").default(0).notNull(),
  intervalDays: integer("interval_days").default(7).notNull(),
  isActive: integer("is_active").default(1).notNull(),
});

export const swapMeet = sqliteTable("swap_meet", {
  id: text("id").primaryKey(),
  slateId: text("slate_id").notNull(),
  sharingFamilyId: text("sharing_family_id").notNull(),
  requestedBy: text("requested_by"),
  status: text("status").default("pending").notNull(),
  createdAt: text("created_at").notNull(),
});

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  name: text("name").notNull(),
  color: text("color"),
  createdAt: text("created_at").notNull(),
});

export const taskTags = sqliteTable("task_tags", {
  id: text("id").primaryKey(),
  tagId: text("tag_id").notNull(),
  taskId: text("task_id").notNull(),
});

export const slateTags = sqliteTable("slate_tags", {
  id: text("id").primaryKey(),
  slateId: text("slate_id").notNull(),
  tagId: text("tag_id").notNull(),
});

export const photos = sqliteTable("photos", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  objectType: text("object_type").notNull(),
  objectId: text("object_id").notNull(),
  url: text("url").notNull(),
  title: text("title"),
  type: text("type").default("probative").notNull(),
  isProbative: integer("is_probative").default(0).notNull(),
  order: integer("order").default(0).notNull(),
  createdAt: text("created_at").notNull(),
});

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  familyId: text("family_id").notNull(),
  reviewerId: text("reviewer_id"),
  approvedBy: text("approved_by"),
  status: text("status").default("pending").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const invites = sqliteTable("invites", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  code: text("code").unique().notNull(),
  email: text("email"),
  role: text("role").default("child").notNull(),
  expiresAt: text("expires_at"),
  used: integer("used").default(0).notNull(),
  createdAt: text("created_at").notNull(),
});
