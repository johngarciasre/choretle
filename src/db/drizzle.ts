import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@/db/schema";

let db: any;

const DATABASE_URL = process.env.DATABASE_URL;
let sqliteDb: Database.Database | null = null;

export async function initDb(): Promise<any> {
  try {
    if (DATABASE_URL && DATABASE_URL.trim() !== "") {
      const postgres = await import("postgres");
      const pgClient = postgres.default(DATABASE_URL);
      db = (await import("drizzle-orm/postgres-js")).drizzle(pgClient, { schema });
    } else {
      sqliteDb = new Database(":memory:");

      // Create tables one by one to avoid multi-statement issues
      await createTable(sqliteDb, "families", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        logo_url TEXT,
        timezone TEXT DEFAULT 'America/New_York' NOT NULL,
        week_start_day INTEGER DEFAULT 0 NOT NULL,
        teams_enabled BOOLEAN DEFAULT 0 NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      `);

      await createTable(sqliteDb, "users", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        avatar_url TEXT,
        role TEXT DEFAULT 'child' NOT NULL,
        family_id TEXT REFERENCES families(id),
        points_total INTEGER DEFAULT 0 NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      `);

      await createTable(sqliteDb, "teams", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        family_id TEXT REFERENCES families(id) NOT NULL,
        name TEXT NOT NULL,
        logo_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      `);

      await createTable(sqliteDb, "team_members", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        team_id TEXT REFERENCES teams(id) NOT NULL,
        user_id TEXT REFERENCES users(id) NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      `);

      await createTable(sqliteDb, "tasks", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        family_id TEXT REFERENCES families(id) NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        points INTEGER DEFAULT 0 NOT NULL,
        icon TEXT,
        archtype TEXT DEFAULT 'job' NOT NULL,
        is_active BOOLEAN DEFAULT 1 NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      `);

      await createTable(sqliteDb, "subtasks", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        task_id TEXT REFERENCES tasks(id) NOT NULL,
        name TEXT NOT NULL,
        points INTEGER DEFAULT 0 NOT NULL,
        "order" INTEGER DEFAULT 0 NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      `);

      await createTable(sqliteDb, "slates", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        family_id TEXT REFERENCES families(id) NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        room_location TEXT,
        frequency TEXT DEFAULT 'weekly' NOT NULL,
        "interval" INTEGER DEFAULT 1 NOT NULL,
        default_due_date_offset INTEGER DEFAULT 0 NOT NULL,
        is_active BOOLEAN DEFAULT 1 NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      `);

      await createTable(sqliteDb, "slate_tasks", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        slate_id TEXT REFERENCES slates(id) NOT NULL,
        task_id TEXT REFERENCES tasks(id) NOT NULL,
        points_override INTEGER,
        "order" INTEGER DEFAULT 0 NOT NULL
      `);

      await createTable(sqliteDb, "lists", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        slate_id TEXT REFERENCES slates(id) NOT NULL,
        family_id TEXT REFERENCES families(id) NOT NULL,
        name TEXT NOT NULL,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP,
        period TEXT DEFAULT 'day' NOT NULL,
        status TEXT DEFAULT 'active' NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      `);

      await createTable(sqliteDb, "list_tasks", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        list_id TEXT REFERENCES lists(id) NOT NULL,
        slate_task_id TEXT REFERENCES slate_tasks(id) NOT NULL,
        points_override INTEGER
      `);

      await createTable(sqliteDb, "jobs", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        list_id TEXT REFERENCES lists(id) NOT NULL,
        slate_task_id TEXT,
        list_task_id TEXT,
        assigned_to TEXT REFERENCES users(id),
        name TEXT NOT NULL,
        description TEXT,
        points INTEGER DEFAULT 0 NOT NULL,
        status TEXT DEFAULT 'todo' NOT NULL,
        due_date TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      `);

      await createTable(sqliteDb, "job_subtasks", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        job_id TEXT REFERENCES jobs(id) NOT NULL,
        subtask_id TEXT REFERENCES subtasks(id) NOT NULL,
        completed_at TIMESTAMP,
        points_awarded INTEGER DEFAULT 0 NOT NULL
      `);

      await createTable(sqliteDb, "comments", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        job_id TEXT REFERENCES jobs(id) NOT NULL,
        user_id TEXT REFERENCES users(id) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      `);

      await createTable(sqliteDb, "job_history", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        job_id TEXT REFERENCES jobs(id) NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        user_id TEXT REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      `);

      await createTable(sqliteDb, "reports", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        family_id TEXT REFERENCES families(id) NOT NULL,
        type TEXT NOT NULL,
        period_start TIMESTAMP NOT NULL,
        period_end TIMESTAMP,
        data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      `);

      await createTable(sqliteDb, "rotations", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        slate_id TEXT REFERENCES slates(id) NOT NULL,
        user_id TEXT REFERENCES users(id) NOT NULL,
        "order" INTEGER DEFAULT 0 NOT NULL,
        interval_days INTEGER DEFAULT 7 NOT NULL,
        is_active BOOLEAN DEFAULT 1 NOT NULL
      `);

      await createTable(sqliteDb, "swap_meet", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        slate_id TEXT REFERENCES slates(id) NOT NULL,
        sharing_family_id TEXT REFERENCES families(id) NOT NULL,
        requested_by TEXT REFERENCES users(id),
        status TEXT DEFAULT 'pending' NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      `);

      await createTable(sqliteDb, "invites", `
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK(id != ''),
        family_id TEXT REFERENCES families(id) NOT NULL,
        code TEXT UNIQUE NOT NULL,
        email TEXT,
        role TEXT DEFAULT 'child' NOT NULL,
        expires_at TIMESTAMP,
        used BOOLEAN DEFAULT 0 NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      `);

      // Create indexes
      sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_users_family_id ON users(family_id)");
      sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_tasks_family_id ON tasks(family_id)");
      sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_slates_family_id ON slates(family_id)");
      sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_jobs_list_id ON jobs(list_id)");
      sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_job_history_job_id ON job_history(job_id)");
      sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_reports_family_id ON reports(family_id)");

      db = drizzleSqlite(sqliteDb, { schema });
    }

    return db;
  } catch (error) {
    console.warn("Skipping database initialization:", error);
    return null;
  }
}

async function createTable(db: Database.Database, tableName: string, columns: string): Promise<void> {
  const sql = `CREATE TABLE IF NOT EXISTS ${tableName} (${columns})`;
  db.prepare(sql).run();
}

export { db };
