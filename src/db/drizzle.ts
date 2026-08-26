import { drizzle as construct } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@/db/schema-sqlite";
import { info, error } from "@/lib/logger.server";

const DB_PATH = process.env.SQLITE_PATH || process.env.SQLITE_DB || ":memory:";

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS families (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
      logo_url TEXT, timezone TEXT DEFAULT 'America/New_York' NOT NULL,
      week_start_day INTEGER DEFAULT 0 NOT NULL, theme TEXT DEFAULT 'coral' NOT NULL,
      teams_enabled INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY, family_id TEXT NOT NULL, week_start_day INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      avatar_url TEXT, role TEXT DEFAULT 'child' NOT NULL, family_id TEXT,
      points_total INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL,
      logo_url TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, user_id TEXT NOT NULL,
      joined_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT, points INTEGER DEFAULT 0 NOT NULL, icon TEXT,
      archtype TEXT DEFAULT 'job' NOT NULL, is_active INTEGER DEFAULT 1 NOT NULL,
      verify_required INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY, family_id TEXT NOT NULL, task_id TEXT,
      name TEXT NOT NULL, points INTEGER DEFAULT 0 NOT NULL,
      "order" INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS slates (
      id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT, room_location TEXT, frequency TEXT DEFAULT 'weekly' NOT NULL,
      interval INTEGER DEFAULT 1 NOT NULL, default_due_date_offset INTEGER DEFAULT 0 NOT NULL,
      subtask_min_required INTEGER, is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS slate_tasks (
      id TEXT PRIMARY KEY, slate_id TEXT NOT NULL, task_id TEXT NOT NULL,
      points_override INTEGER, "order" INTEGER DEFAULT 0 NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY, slate_id TEXT NOT NULL, family_id TEXT NOT NULL,
      name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT,
      period TEXT DEFAULT 'day' NOT NULL, status TEXT DEFAULT 'active' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS list_tasks (
      id TEXT PRIMARY KEY, list_id TEXT NOT NULL, slate_task_id TEXT NOT NULL,
      points_override INTEGER
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, list_id TEXT NOT NULL, slate_task_id TEXT,
      list_task_id TEXT, assigned_to TEXT, name TEXT NOT NULL, description TEXT,
      points INTEGER DEFAULT 0 NOT NULL, status TEXT DEFAULT 'todo' NOT NULL,
      verify_required INTEGER DEFAULT 0 NOT NULL, reviewed_at TEXT,
      due_date TEXT, completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS job_subtasks (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL, subtask_id TEXT NOT NULL,
      completed_at TEXT, points_awarded INTEGER DEFAULT 0 NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL, user_id TEXT NOT NULL,
      content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS job_history (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL, action TEXT NOT NULL,
      details TEXT, user_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY, family_id TEXT NOT NULL, type TEXT NOT NULL,
      period_start TEXT NOT NULL, period_end TEXT, data TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rotations (
      id TEXT PRIMARY KEY, slate_id TEXT NOT NULL, user_id TEXT NOT NULL,
      "order" INTEGER DEFAULT 0 NOT NULL, interval_days INTEGER DEFAULT 7 NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL
    );
    CREATE TABLE IF NOT EXISTS swap_meet (
      id TEXT PRIMARY KEY, slate_id TEXT NOT NULL, sharing_family_id TEXT NOT NULL,
      requested_by TEXT, status TEXT DEFAULT 'pending' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL,
      color TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_tags (
      id TEXT PRIMARY KEY, tag_id TEXT NOT NULL, task_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS slate_tags (
      id TEXT PRIMARY KEY, slate_id TEXT NOT NULL, tag_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY, family_id TEXT NOT NULL, object_type TEXT NOT NULL,
      object_id TEXT NOT NULL, url TEXT NOT NULL, title TEXT,
      type TEXT DEFAULT 'probative' NOT NULL, is_probative INTEGER DEFAULT 0 NOT NULL,
      "order" INTEGER DEFAULT 0 NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL, family_id TEXT NOT NULL,
      reviewer_id TEXT, approved_by TEXT, status TEXT DEFAULT 'pending' NOT NULL,
      notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY, family_id TEXT NOT NULL, code TEXT UNIQUE NOT NULL,
      email TEXT, role TEXT DEFAULT 'child' NOT NULL, expires_at TEXT,
      used INTEGER DEFAULT 0 NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_family ON tasks(family_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_archtype ON tasks(archtype);
    CREATE INDEX IF NOT EXISTS idx_jobs_list ON jobs(list_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_rotations_slate ON rotations(slate_id);
    CREATE INDEX IF NOT EXISTS idx_tags_family ON tags(family_id);
  `);
}

let _db: any = null;
let _rawDb: Database.Database | null = null;
export const db: any = null;

/**
 * Reset the database to a clean state. Used by integration tests.
 */
export function resetDb(): void {
  if (_rawDb) {
    // Drop all tables
    const tables = [
      "families", "routines", "users", "teams", "team_members",
      "tasks", "subtasks", "slates", "slate_tasks", "lists", "list_tasks",
      "jobs", "job_subtasks", "comments", "job_history", "reports",
      "rotations", "swap_meet", "tags", "task_tags", "slate_tags",
      "photos", "reviews", "invites",
    ];
    for (const table of tables) {
      try { _rawDb!.exec(`DROP TABLE IF EXISTS ${table}`); } catch {}
    }
    // Reset db connection so next init creates fresh tables
    _db = null;
  }
}

/**
 * Ensure DB is initialized. Uses file-based SQLite for dev/prod, in-memory for tests.
 */
export async function initDb(): Promise<any> {
  if (_db) return _db;
  
  const dbPath = process.env.SQLITE_PATH || process.env.SQLITE_DB || ":memory:";

  try {
    const Database = require("better-sqlite3");
    _rawDb = new Database(dbPath);
    createTables(_rawDb!);
    _db = construct(_rawDb!, schema as any);
    info({ path: dbPath === ":memory:" ? "in-memory" : dbPath }, "[DB] Initialized SQLite database");
  } catch (err) {
    error({ err: err }, "[DB] Failed to initialize SQLite");
    throw err;
  }
  return _db;
}

export function getRawDb(): Database.Database | null {
  return _rawDb;
}

/**
 * Drizzle insert helper — uses Drizzle's `.run()` (no returning) to avoid stack overflow,
 * then returns the inserted row via raw SQL.
 */
export async function drizzleInsert(db: any, table: any, data: Record<string, any>): Promise<any | undefined> {
  try {
    await db.insert(table).values(data).run();
    const id = data.id;
    if (!id) return data;
    const tableName = (table as any)._?.name || String(table);
    const selectSql = `SELECT * FROM ${tableName} WHERE id = ?`;
    // Use raw SQL to fetch the inserted row
    const raw = getRawDb();
    if (raw) {
      return raw.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
    }
    return data;
  } catch (e) {
    error({ err: e }, "[DB] drizzleInsert failed");
    return undefined;
  }
}

/**
 * Raw SQL insert helper — avoids Drizzle ORM stack overflow bug in `orderSelectedFields`.
 * Returns the inserted row or undefined if it failed.
 */
export async function rawInsert(tableName: string, data: Record<string, any>): Promise<any | undefined> {
  const raw = getRawDb();
  if (!raw) return undefined;

  const columns = Object.keys(data);
  // Auto-add timestamps for tables that support them
  if (!data.created_at && !data.createdAt) {
    data.created_at = new Date().toISOString();
  }
  if (!data.updated_at && !data.updatedAt) {
    data.updated_at = new Date().toISOString();
  }
  // Sanitize column names — only allow alphanumeric + underscore
  for (const col of columns) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
      throw new Error(`Invalid column name: ${col}`);
    }
  }

  const placeholders = columns.map(() => "?").join(", ");
  const values = columns.map((c) => {
    const v = data[c];
    if (typeof v === "boolean") return v ? 1 : 0;
    return v;
  });
  const quotedColumns = columns.map((c) => `"${c}"`).join(", ");
  const sqlStr = `INSERT INTO ${tableName} (${quotedColumns}) VALUES (${placeholders})`;

  try {
    raw.prepare(sqlStr).run(...values);
    const id = data.id;
    if (!id) return undefined;
    const selectSql = `SELECT * FROM ${tableName} WHERE id = ?`;
    return raw.prepare(selectSql).get(id);
  } catch (e) {
    error({ err: e }, `[DB] rawInsert failed for ${tableName}`);
    return undefined;
  }
}

/**
 * Raw SQL batch insert helper — inserts multiple rows in one statement.
 */
export async function rawInsertMany(tableName: string, columns: string[], rows: any[][]): Promise<boolean> {
  const raw = getRawDb();
  if (!raw) return false;

  // Sanitize column names
  for (const col of columns) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
      throw new Error(`Invalid column name: ${col}`);
    }
  }

  const placeholders = rows.map((row) => `(${row.map(() => "?").join(", ")})`).join(", ");
  const sqlStr = `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES ${placeholders}`;
  const flatValues = rows.flat();

  try {
    raw.prepare(sqlStr).run(...flatValues);
    return true;
  } catch (e) {
    error({ err: e }, `[DB] rawInsertMany failed for ${tableName}`);
    return false;
  }
}

/**
 * Raw SQL update helper — returns the updated row.
 */
export async function rawUpdate(tableName: string, data: Record<string, any>, whereCol: string, whereVal: any): Promise<any | undefined> {
  const raw = getRawDb();
  if (!raw) return undefined;

  const setColumns = Object.keys(data).filter((c) => c !== whereCol);
  const quotedSetColumns = setColumns.map((c) => `"${c}"`);
  const setClause = quotedSetColumns.map((c) => `${c} = ?`).join(", ");
  const values = [
    ...setColumns.map((c) => {
      const v = data[c];
      if (typeof v === "boolean") return v ? 1 : 0;
      return v;
    }),
    whereVal,
  ];
  const sqlStr = `UPDATE ${tableName} SET ${setClause} WHERE "${whereCol}" = ?`;

  try {
    raw.prepare(sqlStr).run(...values);
    const selectSql = `SELECT * FROM ${tableName} WHERE ${whereCol} = ?`;
    return raw.prepare(selectSql).get(whereVal);
  } catch (e) {
    error({ err: e }, `[DB] rawUpdate failed for ${tableName}`);
    return undefined;
  }
}

/**
 * Raw SQL delete helper.
 */
export async function rawDelete(tableName: string, whereCol: string, whereVal: any): Promise<boolean> {
  const raw = getRawDb();
  if (!raw) return false;

  const sqlStr = `DELETE FROM ${tableName} WHERE ${whereCol} = ?`;
  try {
    raw.prepare(sqlStr).run(whereVal);
    return true;
  } catch (e) {
    error({ err: e }, `[DB] rawDelete failed for ${tableName}`);
    return false;
  }
}

/**
 * Raw SQL batch delete helper — deletes multiple rows by column values.
 */
export async function rawDeleteMany(tableName: string, whereCol: string, whereValues: any[]): Promise<boolean> {
  if (whereValues.length === 0) return true;
  const raw = getRawDb();
  if (!raw) return false;

  const placeholders = whereValues.map(() => "?").join(", ");
  const sqlStr = `DELETE FROM ${tableName} WHERE ${whereCol} IN (${placeholders})`;
  try {
    raw.prepare(sqlStr).run(...whereValues);
    return true;
  } catch (e) {
    error({ err: e }, `[DB] rawDeleteMany failed for ${tableName}`);
    return false;
  }
}

/**
 * Raw SQL bulk delete helper — deletes all rows matching multiple column-value pairs (AND condition).
 */
export async function rawDeleteWhere(tableName: string, conditions: { col: string; val: any }[]): Promise<boolean> {
  if (conditions.length === 0) return true;
  const raw = getRawDb();
  if (!raw) return false;

  const clauses = conditions.map((c) => `${c.col} = ?`);
  const values = conditions.map((c) => c.val);
  const sqlStr = `DELETE FROM ${tableName} WHERE ${clauses.join(" AND ")}`;
  try {
    raw.prepare(sqlStr).run(...values);
    return true;
  } catch (e) {
    error({ err: e }, `[DB] rawDeleteWhere failed for ${tableName}`);
    return false;
  }
}
