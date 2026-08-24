// Re-export SQLite schema for local development (when POSTGRES_URL is not set).
// In production with PostgreSQL, this file would use pgTable definitions instead.
export * from "@/db/schema-sqlite";

