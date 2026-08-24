import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@/db/schema";

export const db: any = null;

const DB_URL = process.env.POSTGRES_URL;

/**
 * Initialize database only if POSTGRES_URL is provided.
 */
export async function initDb(): Promise<any> {
  // Always return null in this environment (Vercel doesn't have POSTGRES_URL set)
  console.warn("[DB] Not initializing - running on Vercel without POSTGRES_URL");
  return null;
}
