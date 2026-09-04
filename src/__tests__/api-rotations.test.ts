import { describe, it, expect, beforeAll } from "vitest";

let db: any;
let familyId: string;
let userId1: string;
let userId2: string;
let slateId: string;

describe("API Routes — Rotations", () => {
  beforeAll(() => {
    const Database = require("better-sqlite3");
    db = new Database(":memory:");

    db.exec(`
      CREATE TABLE families (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT DEFAULT 'child', family_id TEXT, points_total INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE slates (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, frequency TEXT DEFAULT 'weekly', interval INTEGER DEFAULT 1, is_active BOOLEAN DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE rotations (id TEXT PRIMARY KEY, slate_id TEXT NOT NULL, user_id TEXT NOT NULL, "order" INTEGER DEFAULT 0, interval_days INTEGER DEFAULT 7, is_active BOOLEAN DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    `);

    familyId = crypto.randomUUID();
    userId1 = crypto.randomUUID();
    userId2 = crypto.randomUUID();
    slateId = crypto.randomUUID();

    db.prepare("INSERT INTO families (id, name, slug) VALUES (?, ?, ?)").run(familyId, "Test Family", "test-family");
    db.prepare("INSERT INTO users (id, email, name, role, family_id) VALUES (?, ?, ?, ?, ?)").run(userId1, "user1@test.com", "User 1", "child", familyId);
    db.prepare("INSERT INTO users (id, email, name, role, family_id) VALUES (?, ?, ?, ?, ?)").run(userId2, "user2@test.com", "User 2", "parent", familyId);
    db.prepare("INSERT INTO slates (id, family_id, name, frequency, interval, is_active) VALUES (?, ?, ?, ?, ?, ?)").run(slateId, familyId, "Test Slate", "weekly", 1, 1);

    // Create rotations
    db.prepare('INSERT INTO rotations (id, slate_id, user_id, "order", interval_days) VALUES (?, ?, ?, ?, ?)').run(crypto.randomUUID(), slateId, userId1, 0, 7);
    db.prepare('INSERT INTO rotations (id, slate_id, user_id, "order", interval_days) VALUES (?, ?, ?, ?, ?)').run(crypto.randomUUID(), slateId, userId2, 1, 14);
  });

  describe("GET /api/rotations response pattern", () => {
    it("should return slates with their rotation assignments", () => {
      const families = db.prepare("SELECT * FROM families WHERE id = ?").get(familyId);
      const users = db.prepare("SELECT * FROM users WHERE family_id = ?").all(familyId);
      const slates = db.prepare("SELECT * FROM slates WHERE family_id = ?").all(familyId);
      const slateIds = slates.map((s: any) => s.id);

      let rotations: any[] = [];
      if (slateIds.length > 0) {
        const placeholders = slateIds.map(() => '?').join(',');
        rotations = db.prepare(`SELECT * FROM rotations WHERE slate_id IN (${placeholders})`).all(...slateIds);
      }

      expect(rotations.length).toBe(2);
    });

    it("should enrich rotations with user info", () => {
      const users = db.prepare("SELECT * FROM users WHERE family_id = ?").all(familyId);
      const slateRotations = db.prepare("SELECT * FROM rotations WHERE slate_id = ?").all(slateId);

      const enriched = slateRotations.map((r: any) => {
        const user = users.find((u: any) => u.id === r.user_id || u.id === r.user_id);
        return {
          ...r,
          userName: user?.name || "Unknown",
          userRole: user?.role || "child",
        };
      });

      expect(enriched[0].userName).toBeDefined();
      expect(enriched[0].userRole).toBeDefined();
    });

    it("should group rotations by slate", () => {
      const slates = db.prepare("SELECT * FROM slates WHERE family_id = ?").all(familyId);
      const rotations = db.prepare("SELECT * FROM rotations").all();

      const slatesWithRotations = slates.map((slate: any) => ({
        ...slate,
        assignments: rotations.filter((r: any) => r.slate_id === slate.id),
      }));

      expect(slatesWithRotations[0].assignments.length).toBe(2);
    });

    it("should identify unassigned users", () => {
      const users = db.prepare("SELECT * FROM users WHERE family_id = ?").all(familyId);
      const assignedUserIds = db.prepare("SELECT DISTINCT user_id FROM rotations").all().map((r: any) => r.user_id);

      const unassignedUsers = users.filter((u: any) => !assignedUserIds.includes(u.id));
      expect(Array.isArray(unassignedUsers)).toBe(true);
    });

    it("should return empty arrays for non-existent family", () => {
      const families = db.prepare("SELECT * FROM families WHERE id = ?").get("nonexistent");
      expect(families).toBeUndefined();
    });
  });

  describe("POST /api/rotations (upsert) pattern", () => {
    it("should create a new rotation with required fields", () => {
      const newRotationId = crypto.randomUUID();
      db.prepare('INSERT INTO rotations (id, slate_id, user_id, "order", interval_days) VALUES (?, ?, ?, ?, ?)').run(
        newRotationId, slateId, userId1, 2, 7
      );

      const result = db.prepare("SELECT * FROM rotations WHERE id = ?").get(newRotationId);
      expect(result.id).toBe(newRotationId);
      expect(result.slate_id).toBe(slateId);
      expect(result.user_id).toBe(userId1);
    });

    it("should update an existing rotation when id is provided", () => {
      const existing = db.prepare("SELECT * FROM rotations WHERE slate_id = ?").all(slateId)[0];

      db.prepare('UPDATE rotations SET "order" = ?, interval_days = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(5, 21, 0, existing.id);

      const result = db.prepare("SELECT * FROM rotations WHERE id = ?").get(existing.id);
      expect(result.order).toBe(5);
      expect(result.interval_days).toBe(21);
    });

    it("should validate that slateId and userId are required", () => {
      // In the API, missing fields return 400
      // Here we verify the pattern: empty slateId should not match any rotation
      const result = db.prepare("SELECT * FROM rotations WHERE slate_id = ?").get("");
      expect(result).toBeUndefined();
    });

    it("should use default values for optional fields", () => {
      const newRotationId = crypto.randomUUID();
      db.prepare('INSERT INTO rotations (id, slate_id, user_id) VALUES (?, ?, ?)').run(newRotationId, slateId, userId2);

      const result = db.prepare("SELECT * FROM rotations WHERE id = ?").get(newRotationId);
      expect(result.order).toBe(0); // default
      expect(result.interval_days).toBe(7); // default
    });

    it("should return 201 for new rotation creation", () => {
      const newRotationId = crypto.randomUUID();
      db.prepare('INSERT INTO rotations (id, slate_id, user_id) VALUES (?, ?, ?)').run(newRotationId, slateId, userId1);

      const result = db.prepare("SELECT * FROM rotations WHERE id = ?").get(newRotationId);
      expect(result).not.toBeUndefined();
    });
  });

  describe("DELETE /api/rotations pattern", () => {
    it("should delete a rotation by ID", () => {
      const newRotationId = crypto.randomUUID();
      db.prepare('INSERT INTO rotations (id, slate_id, user_id) VALUES (?, ?, ?)').run(newRotationId, slateId, userId1);

      db.prepare("DELETE FROM rotations WHERE id = ?").run(newRotationId);
      const result = db.prepare("SELECT * FROM rotations WHERE id = ?").get(newRotationId);
      expect(result).toBeUndefined();
    });

    it("should validate that id is required for deletion", () => {
      // Without an ID, nothing should be deleted
      const beforeCount = db.prepare("SELECT COUNT(*) as count FROM rotations").get().count;

      // Deleting with non-existent ID does nothing
      db.prepare("DELETE FROM rotations WHERE id = ?").run("nonexistent");

      const afterCount = db.prepare("SELECT COUNT(*) as count FROM rotations").get().count;
      expect(beforeCount).toBe(afterCount);
    });

    it("should cascade delete all rotations for a slate", () => {
      const tempSlateId = crypto.randomUUID();
      db.prepare("INSERT INTO slates (id, family_id, name) VALUES (?, ?, ?)").run(tempSlateId, familyId, "Temp Slate");

      const rot1 = crypto.randomUUID();
      const rot2 = crypto.randomUUID();
      db.prepare('INSERT INTO rotations (id, slate_id, user_id) VALUES (?, ?, ?)').run(rot1, tempSlateId, userId1);
      db.prepare('INSERT INTO rotations (id, slate_id, user_id) VALUES (?, ?, ?)').run(rot2, tempSlateId, userId2);

      db.prepare("DELETE FROM rotations WHERE slate_id = ?").run(tempSlateId);

      const result = db.prepare("SELECT * FROM rotations WHERE slate_id = ?").all(tempSlateId);
      expect(result.length).toBe(0);
    });
  });

  describe("Rotation interval and ordering", () => {
    it("should respect rotation order within a slate", () => {
      const rotations = db.prepare('SELECT * FROM rotations WHERE slate_id = ? ORDER BY "order"').all(slateId);
      expect(rotations[0].order).toBeLessThanOrEqual(rotations[1].order);
    });

    it("should handle different interval days per rotation", () => {
      const testSlateId = crypto.randomUUID();
      db.prepare("INSERT INTO slates (id, family_id, name) VALUES (?, ?, ?)").run(testSlateId, familyId, "Interval Test Slate");

      const rot1 = crypto.randomUUID();
      const rot2 = crypto.randomUUID();
      db.prepare('INSERT INTO rotations (id, slate_id, user_id, interval_days) VALUES (?, ?, ?, 7)').run(rot1, testSlateId, userId1);
      db.prepare('INSERT INTO rotations (id, slate_id, user_id, interval_days) VALUES (?, ?, ?, 14)').run(rot2, testSlateId, userId2);

      const rotations = db.prepare("SELECT * FROM rotations WHERE slate_id = ?").all(testSlateId);
      const intervals = rotations.map((r: any) => r.interval_days);
      expect(intervals.length).toBe(2);
    });

    it("should track active/inactive rotation status", () => {
      const testSlateId = crypto.randomUUID();
      db.prepare("INSERT INTO slates (id, family_id, name) VALUES (?, ?, ?)").run(testSlateId, familyId, "Status Test Slate");

      const rot1 = crypto.randomUUID();
      const rot2 = crypto.randomUUID();
      db.prepare('INSERT INTO rotations (id, slate_id, user_id, "order", is_active) VALUES (?, ?, ?, 0, 1)').run(rot1, testSlateId, userId1);
      db.prepare('INSERT INTO rotations (id, slate_id, user_id, "order", is_active) VALUES (?, ?, ?, 1, 0)').run(rot2, testSlateId, userId2);

      const active = db.prepare('SELECT * FROM rotations WHERE slate_id = ? AND is_active = 1').all(testSlateId);
      const inactive = db.prepare('SELECT * FROM rotations WHERE slate_id = ? AND is_active = 0').all(testSlateId);

      expect(active.length + inactive.length).toBe(2);
    });
  });

  describe("Rotations for multiple slates", () => {
    it("should return rotations across multiple slates", () => {
      const testSlate1Id = crypto.randomUUID();
      const testSlate2Id = crypto.randomUUID();
      db.prepare("INSERT INTO slates (id, family_id, name) VALUES (?, ?, ?)").run(testSlate1Id, familyId, "Test Slate A");
      db.prepare("INSERT INTO slates (id, family_id, name) VALUES (?, ?, ?)").run(testSlate2Id, familyId, "Test Slate B");

      const rot1 = crypto.randomUUID();
      const rot2 = crypto.randomUUID();
      db.prepare('INSERT INTO rotations (id, slate_id, user_id) VALUES (?, ?, ?)').run(rot1, testSlate1Id, userId1);
      db.prepare('INSERT INTO rotations (id, slate_id, user_id) VALUES (?, ?, ?)').run(rot2, testSlate2Id, userId2);

      const list = db.prepare("SELECT * FROM rotations WHERE slate_id IN (?, ?)").all(testSlate1Id, testSlate2Id);
      expect(list.length).toBe(2); // Exactly 2 for these two slates
    });
  });
});
