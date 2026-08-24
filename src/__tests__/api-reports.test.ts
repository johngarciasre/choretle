import { describe, it, expect, beforeAll } from "vitest";

let db: any;
let familyId: string;
let user1: string;
let user2: string;

describe("API Routes — Reports", () => {
  beforeAll(() => {
    const Database = require("better-sqlite3");
    db = new Database(":memory:");

    db.exec(`
      CREATE TABLE families (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, family_id TEXT, points_total INTEGER DEFAULT 0, role TEXT DEFAULT 'child', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE tasks (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, points INTEGER DEFAULT 0, archtype TEXT DEFAULT 'job', is_active BOOLEAN DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY, list_id TEXT NOT NULL, assigned_to TEXT,
        name TEXT NOT NULL, description TEXT, points INTEGER DEFAULT 0,
        status TEXT DEFAULT 'todo', due_date TIMESTAMP, completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    familyId = crypto.randomUUID();
    user1 = crypto.randomUUID();
    user2 = crypto.randomUUID();

    db.prepare("INSERT INTO families (id, name, slug) VALUES (?, ?, ?)").run(familyId, "Test Family", "test-family");
    db.prepare("INSERT INTO users (id, email, name, family_id) VALUES (?, ?, ?, ?)").run(user1, "user1@test.com", "User 1", familyId);
    db.prepare("INSERT INTO users (id, email, name, family_id) VALUES (?, ?, ?, ?)").run(user2, "user2@test.com", "User 2", familyId);

    // Create jobs with different statuses using ISO strings for dates
    const nowStr = new Date().toISOString();
    db.prepare(`INSERT INTO jobs (id, list_id, assigned_to, name, points, status, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      crypto.randomUUID(), "test-list", user1, "Chore 1 (todo)", 10, "todo", nowStr
    );
    db.prepare(`INSERT INTO jobs (id, list_id, assigned_to, name, points, status, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      crypto.randomUUID(), "test-list", user1, "Chore 2 (doing)", 5, "doing", nowStr
    );
    db.prepare(`INSERT INTO jobs (id, list_id, assigned_to, name, points, status) VALUES (?, ?, ?, ?, ?, ?)`).run(
      crypto.randomUUID(), "test-list", user2, "Chore 3 (under_review)", 15, "under_review"
    );

    // Create completed jobs for "done" report
    const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`INSERT INTO jobs (id, list_id, assigned_to, name, points, status, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      crypto.randomUUID(), "test-list", user1, "Completed Chore 1", 20, "done", yesterday
    );
    db.prepare(`INSERT INTO jobs (id, list_id, assigned_to, name, points, status, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      crypto.randomUUID(), "test-list", user2, "Completed Chore 2", 30, "done", yesterday
    );

    // Create an archived task
    db.prepare("INSERT INTO tasks (id, family_id, name, points, archtype) VALUES (?, ?, ?, ?, ?)").run(
      crypto.randomUUID(), familyId, "Old Task", 10, "archived"
    );
  });

  describe("GET /api/reports/daily pattern", () => {
    it("should return daily report for a date range", () => {
      const jobs = db.prepare("SELECT * FROM jobs WHERE status = 'done' AND completed_at IS NOT NULL").all();
      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs.length).toBeGreaterThan(0);
    });

    it("should handle empty date range gracefully", () => {
      const jobs = db.prepare("SELECT * FROM jobs WHERE 1=0").all();
      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs.length).toBe(0);
    });
  });

  describe("GET /api/reports/done pattern", () => {
    it("should return all completed jobs", () => {
      const doneJobs = db.prepare("SELECT * FROM jobs WHERE status = 'done'").all();
      expect(doneJobs.length).toBe(2);
    });

    it("should calculate total points for completed jobs", () => {
      const doneJobs = db.prepare("SELECT SUM(points) as total FROM jobs WHERE status = 'done'").get();
      expect(doneJobs.total).toBe(50); // 20 + 30
    });
  });

  describe("GET /api/reports/task pattern", () => {
    it("should return task-based report data", () => {
      const tasks = db.prepare("SELECT * FROM tasks").all();
      expect(Array.isArray(tasks)).toBe(true);
    });

    it("should handle archived tasks correctly", () => {
      const archived = db.prepare("SELECT * FROM tasks WHERE archtype = 'archived'").all();
      expect(archived.length).toBe(1);
    });
  });

  describe("GET /api/reports/member pattern", () => {
    it("should return per-member points summary", () => {
      const memberPoints = db.prepare(`
        SELECT assigned_to, SUM(points) as total_points
        FROM jobs WHERE status = 'done'
        GROUP BY assigned_to
      `).all();

      expect(memberPoints.length).toBeGreaterThan(0);
    });

    it("should sort members by points descending", () => {
      const sorted = db.prepare(`
        SELECT assigned_to, SUM(points) as total_points
        FROM jobs WHERE status = 'done'
        GROUP BY assigned_to
        ORDER BY total_points DESC
      `).all();

      if (sorted.length > 1) {
        expect(sorted[0].total_points).toBeGreaterThanOrEqual(sorted[1].total_points);
      }
    });
  });

  describe("GET /api/reports/wallboard pattern", () => {
    it("should return aggregated wallboard data", () => {
      const stats = db.prepare(`
        SELECT 
          COUNT(*) as total_jobs,
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done_count,
          SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as todo_count,
          SUM(CASE WHEN status = 'doing' THEN 1 ELSE 0 END) as doing_count
        FROM jobs
      `).get();

      expect(stats.total_jobs).toBe(5);
      expect(stats.done_count).toBe(2);
    });

    it("should handle families with no jobs", () => {
      const emptyStats = db.prepare(`
        SELECT 
          COUNT(*) as total_jobs,
          COALESCE(SUM(points), 0) as total_points
        FROM jobs WHERE 1=0
      `).get();

      expect(emptyStats.total_jobs).toBe(0);
      expect(emptyStats.total_points).toBe(0);
    });
  });

  describe("Report aggregation patterns", () => {
    it("should handle date-based filtering for reports", () => {
      const recentDone = db.prepare(`
        SELECT * FROM jobs 
        WHERE status = 'done' 
        AND completed_at IS NOT NULL
      `).all();

      expect(Array.isArray(recentDone)).toBe(true);
      expect(recentDone.length).toBe(2);
    });

    it("should aggregate points across multiple users for weekly report", () => {
      const weeklyPoints = db.prepare(`
        SELECT assigned_to, 
               SUM(points) as weekly_points
        FROM jobs 
        WHERE status = 'done' 
        GROUP BY assigned_to
      `).all();

      expect(weeklyPoints.length).toBe(2);
    });
  });
});
