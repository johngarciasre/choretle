import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@/db/schema";

export const db: any = null;

const DATABASE_URL = process.env.DATABASE_URL;

/**
 * Initialize database only if DATABASE_URL is provided.
 * Returns null for Vercel deployments without PostgreSQL.
 */
export async function initDb(): Promise<any> {
  // Always return null in this environment (Vercel doesn't have DB_URL set)
  console.warn("[DB] Not initializing - running on Vercel without DATABASE_URL");
  return null;
}
