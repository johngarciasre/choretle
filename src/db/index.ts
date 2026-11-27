/**
 * Database access layer — Postgres only.
 *
 * The app talks to Postgres through a tiny async shim that keeps the shape the
 * rest of the code already uses (`db.prepare(sql).get/all/run`), so a call site
 * only ever needed `await` added. `prepare()` itself stays synchronous: the
 * driver is resolved lazily on first execution.
 *
 * Drivers:
 *   - `pg`      when DATABASE_URL is set (dev, demo, production)
 *   - `PGlite`  in tests (NODE_ENV=test) or when PGLITE_PATH is set — real
 *               Postgres compiled to wasm, no container needed
 */

import fs from "node:fs";
import path from "node:path";

export type Row = Record<string, any>;

export interface RunResult {
  rowCount: number;
  /** Legacy call sites used `.changes` for existence checks. */
  changes: number;
}

export interface Stmt {
  get(...params: any[]): Promise<Row | undefined>;
  all(...params: any[]): Promise<Row[]>;
  run(...params: any[]): Promise<RunResult>;
}

export interface QueryResult {
  rows: Row[];
  rowCount: number;
}

export type QueryFn = (text: string, params?: any[]) => Promise<QueryResult>;

export class Db {
  private bound: QueryFn | null;

  constructor(
    private readonly resolve: () => Promise<Driver>,
    bound?: QueryFn,
  ) {
    this.bound = bound ?? null;
  }

  private queryFn(): QueryFn {
    if (this.bound) return this.bound;
    return async (text, params) => (await this.resolve()).query(text, params);
  }

  prepare(sql: string): Stmt {
    const text = toPgPlaceholders(sql);
    return {
      get: async (...params) => {
        const res = await this.queryFn()(text, params);
        return res.rows[0];
      },
      all: async (...params) => {
        const res = await this.queryFn()(text, params);
        return res.rows;
      },
      run: async (...params) => {
        const res = await this.queryFn()(text, params);
        return { rowCount: res.rowCount, changes: res.rowCount };
      },
    };
  }

  query(text: string, params: any[] = []): Promise<QueryResult> {
    return this.queryFn()(text, params);
  }

  async exec(text: string): Promise<void> {
    if (this.bound) {
      await this.bound(text);
      return;
    }
    await (await this.resolve()).exec(text);
  }
}

interface Driver {
  query: QueryFn;
  exec(text: string): Promise<void>;
  transaction<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Convert `?` placeholders to `$1..$n`, skipping quoted text so a `?` inside a
 * string literal or a `"quoted"` identifier is never rewritten.
 */
export function toPgPlaceholders(sql: string): string {
  let out = "";
  let index = 0;
  let n = 0;

  while (index < sql.length) {
    const ch = sql[index];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += ch;
      index += 1;
      while (index < sql.length) {
        out += sql[index];
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) {
            out += sql[index + 1];
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    if (ch === "-" && sql[index + 1] === "-") {
      const end = sql.indexOf("\n", index);
      if (end === -1) {
        out += sql.slice(index);
        break;
      }
      out += sql.slice(index, end);
      index = end;
      continue;
    }
    if (ch === "?") {
      n += 1;
      out += `$${n}`;
      index += 1;
      continue;
    }
    out += ch;
    index += 1;
  }

  return out;
}

// ─── Driver construction ────────────────────────────────────────────────────

function connectViaPg(): Promise<Driver> {
  return (async () => {
    const mod: any = await import("pg");
    const pg = mod.default ?? mod;

    // Keep the JSON contract the app already had: numbers for counts, ISO
    // strings for timestamps, plain dates as `YYYY-MM-DD`.
    pg.types.setTypeParser(20, (v: string) => Number(v));
    pg.types.setTypeParser(21, (v: string) => Number(v));
    pg.types.setTypeParser(1700, (v: string) => Number(v));
    pg.types.setTypeParser(1082, (v: string) => v);
    pg.types.setTypeParser(1114, (v: string) => new Date(`${v.replace(" ", "T")}Z`).toISOString());
    pg.types.setTypeParser(1184, (v: string) => new Date(v.replace(" ", "T")).toISOString());

    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX || 10),
    });

    const query: QueryFn = async (text, params) => {
      const res = await pool.query(text, params ?? []);
      return { rows: res.rows as Row[], rowCount: res.rowCount ?? 0 };
    };

    return {
      query,
      exec: async (text) => {
        const client = await pool.connect();
        try {
          await client.query(text);
        } finally {
          client.release();
        }
      },
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("begin");
          const txQuery: QueryFn = async (text, params) => {
            const res = await client.query(text, params ?? []);
            return { rows: res.rows as Row[], rowCount: res.rowCount ?? 0 };
          };
          const result = await fn(new Db(async () => driverPromiseForActive(), txQuery));
          await client.query("commit");
          return result;
        } catch (err) {
          await client.query("rollback");
          throw err;
        } finally {
          client.release();
        }
      },
      close: async () => {
        await pool.end();
      },
    };
  })();
}

// Transaction-scoped Db instances need a resolve() that never runs, because all
// their queries go through `bound`.
function driverPromiseForActive(): Promise<Driver> {
  return activeDriver();
}

function connectViaPGlite(): Promise<Driver> {
  return (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const dataDir = process.env.PGLITE_PATH;
    const client = dataDir ? new PGlite(dataDir) : new PGlite();
    await (client as any).waitReady;

    const query: QueryFn = async (text, params) => {
      const res = await client.query(text, params ?? []);
      return { rows: res.rows as Row[], rowCount: (res as any).affectedRows ?? 0 };
    };

    return {
      query,
      exec: async (text) => {
        await client.exec(text);
      },
      transaction: async (fn) => {
        let result!: unknown;
        await client.transaction(async (tx) => {
          const txQuery: QueryFn = async (text, params) => {
            const res = await tx.query(text, params ?? []);
            return { rows: res.rows as Row[], rowCount: (res as any).affectedRows ?? 0 };
          };
          result = await fn(new Db(async () => driverPromiseForActive(), txQuery));
        });
        return result as any;
      },
      close: async () => {
        await client.close();
      },
    };
  })();
}

function shouldUsePGlite(): boolean {
  if (process.env.PGLITE_PATH) return true;
  if (process.env.NODE_ENV === "test") return true;
  return !process.env.DATABASE_URL;
}

// ─── Migrations ─────────────────────────────────────────────────────────────

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

export function migrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

export async function runMigrations(driver: Driver, quiet = false): Promise<string[]> {
  await driver.exec(
    "create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())",
  );

  const applied: string[] = [];
  for (const file of migrationFiles()) {
    const { rows } = await driver.query("select 1 from schema_migrations where version = $1", [file]);
    if (rows.length > 0) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    if (sql.includes("$$")) {
      throw new Error(`migration ${file} contains a $$ block; apply it manually`);
    }
    await driver.exec(
      `begin;\n${sql}\ninsert into schema_migrations (version) values ('${file.replace(/'/g, "''")}');\ncommit;`,
    );
    applied.push(file);
    if (!quiet) {
      console.info(`[db] applied migration ${file}`);
    }
  }
  return applied;
}

/** Used by `npm run db:migrate` and by the app when AUTO_MIGRATE is on. */
export async function migrate(): Promise<string[]> {
  return runMigrations(await activeDriver(), true);
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let driverPromise: Promise<Driver> | null = null;

function autoMigrateEnabled(): boolean {
  if (process.env.AUTO_MIGRATE === "1") return true;
  if (process.env.AUTO_MIGRATE === "0") return false;
  return process.env.NODE_ENV !== "production";
}

function activeDriver(): Promise<Driver> {
  if (!driverPromise) {
    driverPromise = (async () => {
      const driver = shouldUsePGlite() ? await connectViaPGlite() : await connectViaPg();
      if (autoMigrateEnabled()) {
        await runMigrations(driver, true);
      }
      return driver;
    })();
    driverPromise.catch(() => {
      driverPromise = null;
    });
  }
  return driverPromise;
}

const rootDb = new Db(activeDriver);

/** The app-wide handle. Synchronous; every statement returns a promise. */
export function getDb(): Db {
  return rootDb;
}

/** Kept for call sites that explicitly initialise; resolves the driver. */
export async function initDb(): Promise<Db> {
  await activeDriver();
  return rootDb;
}

export async function withTx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return (await activeDriver()).transaction(fn);
}

const RESET_TABLES = [
  "sessions",
  "device_enrollments",
  "household_links",
  "memberships",
  "auth_identities",
  "invites",
  "reviews",
  "photos",
  "slate_tags",
  "task_tags",
  "tags",
  "swap_meet",
  "rotations",
  "reports",
  "job_history",
  "comments",
  "job_subtasks",
  "jobs",
  "list_tasks",
  "lists",
  "slate_tasks",
  "slates",
  "subtasks",
  "tasks",
  "team_members",
  "teams",
  "routines",
  "users",
  "households",
];

/** Truncate everything. Integration tests call this between cases. */
export async function resetDb(): Promise<void> {
  await rootDb.exec(`truncate table ${RESET_TABLES.join(", ")} cascade`);
}

export async function closeDb(): Promise<void> {
  if (!driverPromise) return;
  const driver = await driverPromise;
  await driver.close();
  driverPromise = null;
}

export function getDbSync(): Db | null {
  return rootDb;
}
