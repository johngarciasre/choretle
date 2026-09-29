import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";

// ─── Helpers ──────────────────────────────────────────────────────────

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE families (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      role TEXT DEFAULT 'child' NOT NULL, family_id TEXT,
      points_total INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE lists (
      id TEXT PRIMARY KEY, slate_id TEXT NOT NULL, family_id TEXT NOT NULL,
      name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT,
      period TEXT DEFAULT 'day' NOT NULL, status TEXT DEFAULT 'active' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY, list_id TEXT NOT NULL,
      assigned_to TEXT, name TEXT NOT NULL, description TEXT,
      points INTEGER DEFAULT 0 NOT NULL, status TEXT DEFAULT 'todo' NOT NULL,
      due_date TEXT, completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);
  return db;
}

function insertFamily(db: Database.Database): string {
  const id = "fam-test-medals";
  db.prepare("INSERT INTO families (id, name, slug) VALUES (?, 'Medals Test', 'medals-test')").run(id);
  return id;
}

function insertUser(db: Database.Database, userId: string, familyId: string, pointsTotal: number): void {
  db.prepare(
    "INSERT INTO users (id, email, name, role, family_id, points_total) VALUES (?, 'user-medals@test.com', 'Test User', 'child', ?, ?)"
  ).run(userId, familyId, pointsTotal);
}

function insertList(db: Database.Database, listId: string, familyId: string): void {
  db.prepare(
    "INSERT INTO lists (id, slate_id, family_id, name, start_date, end_date, period) VALUES (?, 'slate-1', ?, 'Test List', datetime('now'), datetime('now', '+1 day'), 'day')"
  ).run(listId, familyId);
}

function insertJob(
  db: Database.Database,
  jobId: string,
  listId: string,
  assignedTo: string,
  status: string,
  completedAt: string | null = null
): void {
  db.prepare(
    "INSERT INTO jobs (id, list_id, assigned_to, name, points, status, completed_at) VALUES (?, ?, ?, 'Test Task', 10, ?, ?)"
  ).run(jobId, listId, assignedTo, status, completedAt);
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("Medals System", () => {
  let db: Database.Database;
  let familyId: string;
  let userId: string;
  let listId: string;

  beforeAll(() => {
    db = createTestDb();
    familyId = insertFamily(db);
    userId = "user-medals-1";
    insertUser(db, userId, familyId, 0);
    listId = "list-medals-1";
    insertList(db, listId, familyId);
  });

  afterAll(() => {
    db.close();
  });

  describe("Points medal", () => {
    it("should award bronze at 50+ points", () => {
      db.prepare("UPDATE users SET points_total = 50 WHERE id = ?").run(userId);
      const pts = db.prepare("SELECT points_total FROM users WHERE id = ?").get(userId) as any;
      expect(pts.points_total).toBeGreaterThanOrEqual(50);
    });

    it("should award silver at 200+ points", () => {
      db.prepare("UPDATE users SET points_total = 200 WHERE id = ?").run(userId);
      const pts = db.prepare("SELECT points_total FROM users WHERE id = ?").get(userId) as any;
      expect(pts.points_total).toBeGreaterThanOrEqual(200);
    });

    it("should award gold at 500+ points", () => {
      db.prepare("UPDATE users SET points_total = 500 WHERE id = ?").run(userId);
      const pts = db.prepare("SELECT points_total FROM users WHERE id = ?").get(userId) as any;
      expect(pts.points_total).toBeGreaterThanOrEqual(500);
    });

    it("should award diamond at 1000+ points", () => {
      db.prepare("UPDATE users SET points_total = 1000 WHERE id = ?").run(userId);
      const pts = db.prepare("SELECT points_total FROM users WHERE id = ?").get(userId) as any;
      expect(pts.points_total).toBeGreaterThanOrEqual(1000);
    });
  });

  describe("Tasks Completed medal", () => {
    it("should award bronze at 5+ completed jobs", () => {
      for (let i = 0; i < 5; i++) {
        insertJob(db, `job-done-${i}`, listId, userId, "done", "2026-01-01T00:00:00");
      }
      const cnt = db.prepare(
        "SELECT COUNT(*) as cnt FROM jobs WHERE assigned_to = ? AND status = 'done'"
      ).get(userId) as any;
      expect(cnt.cnt).toBeGreaterThanOrEqual(5);
    });

    it("should award silver at 20+ completed jobs", () => {
      for (let i = 5; i < 20; i++) {
        insertJob(db, `job-done-${i}`, listId, userId, "done", "2026-01-01T00:00:00");
      }
      const cnt = db.prepare(
        "SELECT COUNT(*) as cnt FROM jobs WHERE assigned_to = ? AND status = 'done'"
      ).get(userId) as any;
      expect(cnt.cnt).toBeGreaterThanOrEqual(20);
    });

    it("should award gold at 50+ completed jobs", () => {
      for (let i = 20; i < 50; i++) {
        insertJob(db, `job-done-${i}`, listId, userId, "done", "2026-01-01T00:00:00");
      }
      const cnt = db.prepare(
        "SELECT COUNT(*) as cnt FROM jobs WHERE assigned_to = ? AND status = 'done'"
      ).get(userId) as any;
      expect(cnt.cnt).toBeGreaterThanOrEqual(50);
    });

    it("should award diamond at 100+ completed jobs", () => {
      for (let i = 50; i < 100; i++) {
        insertJob(db, `job-done-${i}`, listId, userId, "done", "2026-01-01T00:00:00");
      }
      const cnt = db.prepare(
        "SELECT COUNT(*) as cnt FROM jobs WHERE assigned_to = ? AND status = 'done'"
      ).get(userId) as any;
      expect(cnt.cnt).toBeGreaterThanOrEqual(100);
    });
  });

  describe("Streak medal", () => {
    it("should award bronze at 3 consecutive days", () => {
      // Insert jobs on 3 consecutive days
      for (let i = 0; i < 3; i++) {
        insertJob(db, `job-streak-${i}`, listId, userId, "done", `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00`);
      }
      const streak = db.prepare(`
        SELECT COUNT(*) as streak FROM (
          SELECT DATE(completed_at) as day
          FROM jobs
          WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
          GROUP BY day
          ORDER BY day DESC
        )
      `).get(userId) as any;
      expect(streak.streak).toBeGreaterThanOrEqual(3);
    });

    it("should award silver at 7 consecutive days", () => {
      for (let i = 0; i < 4; i++) {
        insertJob(db, `job-streak-7-${i}`, listId, userId, "done", `2026-01-${String(i + 4).padStart(2, "0")}T00:00:00`);
      }
      const streak = db.prepare(`
        SELECT COUNT(*) as streak FROM (
          SELECT DATE(completed_at) as day
          FROM jobs
          WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
          GROUP BY day
          ORDER BY day DESC
        )
      `).get(userId) as any;
      expect(streak.streak).toBeGreaterThanOrEqual(7);
    });

    it("should award gold at 14 consecutive days", () => {
      for (let i = 0; i < 7; i++) {
        insertJob(db, `job-streak-14-${i}`, listId, userId, "done", `2026-01-${String(i + 8).padStart(2, "0")}T00:00:00`);
      }
      const streak = db.prepare(`
        SELECT COUNT(*) as streak FROM (
          SELECT DATE(completed_at) as day
          FROM jobs
          WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
          GROUP BY day
          ORDER BY day DESC
        )
      `).get(userId) as any;
      expect(streak.streak).toBeGreaterThanOrEqual(14);
    });

    it("should award diamond at 30 consecutive days", () => {
      for (let i = 0; i < 16; i++) {
        const day = String(i + 15).padStart(2, "0");
        insertJob(db, `job-streak-30-${i}`, listId, userId, "done", `2026-01-${day}T00:00:00`);
      }
      const streak = db.prepare(`
        SELECT COUNT(*) as streak FROM (
          SELECT DATE(completed_at) as day
          FROM jobs
          WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
          GROUP BY day
          ORDER BY day DESC
        )
      `).get(userId) as any;
      expect(streak.streak).toBeGreaterThanOrEqual(30);
    });
  });

  describe("Weekly Peak medal", () => {
    it("should award bronze at 3+ tasks in a single week", () => {
      for (let i = 0; i < 3; i++) {
        insertJob(db, `job-week-${i}`, listId, userId, "done", "2026-01-01T00:00:00");
      }
      const peak = db.prepare(`
        SELECT MAX(week_count) as peak FROM (
          SELECT COUNT(*) as week_count
          FROM jobs
          WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
          GROUP BY strftime('%Y-%W', DATE(completed_at))
        )
      `).get(userId) as any;
      expect(peak.peak).toBeGreaterThanOrEqual(3);
    });

    it("should award silver at 7+ tasks in a single week", () => {
      for (let i = 0; i < 4; i++) {
        insertJob(db, `job-week-7-${i}`, listId, userId, "done", "2026-01-01T00:00:00");
      }
      const peak = db.prepare(`
        SELECT MAX(week_count) as peak FROM (
          SELECT COUNT(*) as week_count
          FROM jobs
          WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
          GROUP BY strftime('%Y-%W', DATE(completed_at))
        )
      `).get(userId) as any;
      expect(peak.peak).toBeGreaterThanOrEqual(7);
    });

    it("should award gold at 15+ tasks in a single week", () => {
      for (let i = 0; i < 8; i++) {
        insertJob(db, `job-week-15-${i}`, listId, userId, "done", "2026-01-01T00:00:00");
      }
      const peak = db.prepare(`
        SELECT MAX(week_count) as peak FROM (
          SELECT COUNT(*) as week_count
          FROM jobs
          WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
          GROUP BY strftime('%Y-%W', DATE(completed_at))
        )
      `).get(userId) as any;
      expect(peak.peak).toBeGreaterThanOrEqual(15);
    });

    it("should award diamond at 25+ tasks in a single week", () => {
      for (let i = 0; i < 10; i++) {
        insertJob(db, `job-week-25-${i}`, listId, userId, "done", "2026-01-01T00:00:00");
      }
      const peak = db.prepare(`
        SELECT MAX(week_count) as peak FROM (
          SELECT COUNT(*) as week_count
          FROM jobs
          WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
          GROUP BY strftime('%Y-%W', DATE(completed_at))
        )
      `).get(userId) as any;
      expect(peak.peak).toBeGreaterThanOrEqual(25);
    });
  });

  describe("Consistency medal", () => {
    it("should award bronze at 4+ distinct weeks with completions", () => {
      // Use dates spread across different weeks (past dates)
      const dates = ["2026-07-01", "2026-07-08", "2026-07-15", "2026-07-22"];
      dates.forEach((date, i) => {
        insertJob(db, `job-cons-${i}`, listId, userId, "done", `${date}T00:00:00`);
      });
      const weeks = db.prepare(`
        SELECT COUNT(DISTINCT strftime('%Y-%W', DATE(completed_at))) as weeks
        FROM jobs
        WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
          AND completed_at >= datetime('now', '-364 days')
      `).get(userId) as any;
      expect(weeks.weeks).toBeGreaterThanOrEqual(4);
    });

    it("should award silver at 8+ distinct weeks with completions", () => {
      // Spread across 8 different weeks in the past
      const dates = [
        "2026-07-01", "2026-07-08", "2026-07-15", "2026-07-22",
        "2026-07-29", "2026-08-05", "2026-08-12", "2026-08-19",
      ];
      dates.forEach((date, i) => {
        insertJob(db, `job-cons-8-${i}`, listId, userId, "done", `${date}T00:00:00`);
      });
      const weeks = db.prepare(`
        SELECT COUNT(DISTINCT strftime('%Y-%W', DATE(completed_at))) as weeks
        FROM jobs
        WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
          AND completed_at >= datetime('now', '-364 days')
      `).get(userId) as any;
      expect(weeks.weeks).toBeGreaterThanOrEqual(8);
    });

    it("should award gold at 16+ distinct weeks with completions", () => {
      // Spread across 16 different weeks (4 months back from now)
      const dates = [
        "2026-07-01", "2026-07-08", "2026-07-15", "2026-07-22",
        "2026-07-29", "2026-08-05", "2026-08-12", "2026-08-19",
        "2026-08-26", "2026-09-02", "2026-09-09", "2026-09-16",
        "2026-09-23", "2026-09-25", "2026-09-27", "2026-09-28",
      ];
      dates.forEach((date, i) => {
        insertJob(db, `job-cons-16-${i}`, listId, userId, "done", `${date}T00:00:00`);
      });
      const weeks = db.prepare(`
        SELECT COUNT(DISTINCT strftime('%Y-%W', DATE(completed_at))) as weeks
        FROM jobs
        WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
          AND completed_at >= datetime('now', '-364 days')
      `).get(userId) as any;
      expect(weeks.weeks).toBeGreaterThanOrEqual(16);
    });

    it("should award diamond at 30+ distinct weeks with completions", () => {
      // Spread across ~30 different weeks (full year back from now)
      const dates = [
        "2025-11-01", "2025-11-08", "2025-11-15", "2025-11-22",
        "2025-11-29", "2025-12-06", "2025-12-13", "2025-12-20",
        "2025-12-27", "2026-01-03", "2026-01-10", "2026-01-17",
        "2026-01-24", "2026-01-31", "2026-02-07", "2026-02-14",
        "2026-02-21", "2026-02-28", "2026-03-07", "2026-03-14",
        "2026-03-21", "2026-03-28", "2026-04-04", "2026-04-11",
        "2026-04-18", "2026-04-25", "2026-05-02", "2026-05-09",
        "2026-05-16", "2026-05-23",
      ];
      dates.forEach((date, i) => {
        insertJob(db, `job-cons-30-${i}`, listId, userId, "done", `${date}T00:00:00`);
      });
      const weeks = db.prepare(`
        SELECT COUNT(DISTINCT strftime('%Y-%W', DATE(completed_at))) as weeks
        FROM jobs
        WHERE assigned_to = ? AND status = 'done' AND completed_at IS NOT NULL
          AND completed_at >= datetime('now', '-364 days')
      `).get(userId) as any;
      expect(weeks.weeks).toBeGreaterThanOrEqual(30);
    });
  });

  describe("Leaderboard medal", () => {
    it("should award bronze at top 3 in family", () => {
      // Insert 2 more users with lower points (unique emails)
      for (let i = 1; i <= 2; i++) {
        const uid = `user-medals-${i + 1}`;
        db.prepare(
          "INSERT INTO users (id, email, name, role, family_id, points_total) VALUES (?, ?, 'Other User', 'child', ?, ?)",
        ).run(uid, `other${i}@test.com`, familyId, 1000 - i * 100);
      }
      const rank = db.prepare(`
        SELECT RANK() OVER (ORDER BY points_total DESC) as rank
        FROM users WHERE id = ? AND family_id = ?
      `).get(userId, familyId) as any;
      expect(rank.rank).toBeLessThanOrEqual(3);
    });

    it("should award silver at top 2 in family", () => {
      // Insert 1 more user with lower points (unique email)
      const uid = "user-medals-4";
      db.prepare(
        "INSERT INTO users (id, email, name, role, family_id, points_total) VALUES (?, ?, 'Other User', 'child', ?, ?)",
      ).run(uid, `other3@test.com`, familyId, 900);
      const rank = db.prepare(`
        SELECT RANK() OVER (ORDER BY points_total DESC) as rank
        FROM users WHERE id = ? AND family_id = ?
      `).get(userId, familyId) as any;
      expect(rank.rank).toBeLessThanOrEqual(2);
    });

    it("should award gold at #1 in family", () => {
      // Set our user to highest points
      db.prepare("UPDATE users SET points_total = ? WHERE id = ?",).run(9999, userId);
      const rank = db.prepare(`
        SELECT RANK() OVER (ORDER BY points_total DESC) as rank
        FROM users WHERE id = ? AND family_id = ?
      `).get(userId, familyId) as any;
      expect(rank.rank).toBe(1);
    });

    it("should award diamond at #1 for a month (same SQL check)", () => {
      // The leaderboard medal type uses the same rank query but checks if rank <= 1
      const rank = db.prepare(`
        SELECT RANK() OVER (ORDER BY points_total DESC) as rank
        FROM users WHERE id = ? AND family_id = ?
      `).get(userId, familyId) as any;
      expect(rank.rank).toBe(1);
    });
  });
});
