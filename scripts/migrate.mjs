#!/usr/bin/env node
/**
 * Apply every pending SQL migration in db/migrations, in filename order.
 *
 *   DATABASE_URL=postgres://... npm run db:migrate
 *
 * Standalone on purpose: it must run as an init step, before the app starts,
 * without importing the Next.js app or any TypeScript.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const dir = path.join(process.cwd(), "db", "migrations");
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const files = fs
  .readdirSync(dir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  await client.query(
    "create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())",
  );

  let applied = 0;
  for (const file of files) {
    const { rows } = await client.query("select 1 from schema_migrations where version = $1", [file]);
    if (rows.length > 0) {
      console.log(`[migrate] skip ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await client.query(
      `begin;\n${sql}\ninsert into schema_migrations (version) values ('${file.replace(/'/g, "''")}');\ncommit;`,
    );
    console.log(`[migrate] applied ${file}`);
    applied += 1;
  }

  console.log(`[migrate] done, ${applied} applied, ${files.length} known`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error("[migrate] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
