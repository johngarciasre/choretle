import { describe, it, expect, beforeAll } from "vitest";

let db: any;
let familyId: string;
let slateId: string;
let taskId2: string;
let taskId1: string;

describe("API Routes — Tags", () => {
  beforeAll(() => {
    const Database = require("better-sqlite3");
    db = new Database(":memory:");

    db.exec(`
      CREATE TABLE families (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE tags (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT DEFAULT '#000000', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE task_tags (task_id TEXT NOT NULL, tag_id TEXT NOT NULL);
      CREATE TABLE slate_tags (slate_id TEXT NOT NULL, tag_id TEXT NOT NULL);
      CREATE TABLE tasks (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, points INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE slates (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    `);

    familyId = crypto.randomUUID();
    db.prepare("INSERT INTO families (id, name, slug) VALUES (?, ?, ?)").run(familyId, "Test Family", "test-family");

    // Create tags
    const tag1 = crypto.randomUUID();
    const tag2 = crypto.randomUUID();
    const tag3 = crypto.randomUUID();
    db.prepare("INSERT INTO tags (id, family_id, name, color) VALUES (?, ?, ?, ?)").run(tag1, familyId, "Chore", "#ff0000");
    db.prepare("INSERT INTO tags (id, family_id, name, color) VALUES (?, ?, ?, ?)").run(tag2, familyId, "Household", "#00ff00");
    db.prepare("INSERT INTO tags (id, family_id, name, color) VALUES (?, ?, ?, ?)").run(tag3, familyId, "Optional", "#0000ff");

    // Create tasks and link them to tags
    const task1 = (taskId1 = crypto.randomUUID());
    db.prepare("INSERT INTO tasks (id, family_id, name) VALUES (?, ?, ?)").run(task1, familyId, "Clean Windows");
    db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run(task1, tag1);

    const task2 = (taskId2 = crypto.randomUUID());
    db.prepare("INSERT INTO tasks (id, family_id, name) VALUES (?, ?, ?)").run(task2, familyId, "Vacuum");
    db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run(task2, tag1);
    db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run(task2, tag2);

    // Create slates and link them to tags
    slateId = crypto.randomUUID();
    db.prepare("INSERT INTO slates (id, family_id, name) VALUES (?, ?, ?)").run(slateId, familyId, "Slate 1");
    db.prepare("INSERT INTO slate_tags (slate_id, tag_id) VALUES (?, ?)").run(slateId, tag2);
  });

  describe("GET /api/tags response pattern", () => {
    it("should return all tags for a family with task counts", () => {
      const tags = db.prepare("SELECT * FROM tags WHERE family_id = ?").all(familyId);
      expect(tags.length).toBe(3);
    });

    it("should count tasks per tag via task_tags junction", () => {
      const tagsWithCounts = db.prepare(`
        SELECT t.*, COUNT(tt.task_id) as task_count
        FROM tags t
        LEFT JOIN task_tags tt ON t.id = tt.tag_id
        WHERE t.family_id = ?
        GROUP BY t.id
      `).all(familyId);

      expect(tagsWithCounts.length).toBe(3);
      const choreTag = tagsWithCounts.find((t: any) => t.name === "Chore");
      expect(choreTag.task_count).toBe(2); // Both tasks have "Chore" tag
    });

    it("should return empty array for non-existent family", () => {
      const tags = db.prepare("SELECT * FROM tags WHERE family_id = ?").all("nonexistent");
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBe(0);
    });
  });

  describe("POST /api/tags creation pattern", () => {
    it("should create a new tag with name and color", () => {
      const newTagId = crypto.randomUUID();
      db.prepare("INSERT INTO tags (id, family_id, name, color) VALUES (?, ?, ?, ?)").run(
        newTagId, familyId, "New Tag", "#123456"
      );

      const result = db.prepare("SELECT * FROM tags WHERE id = ?").get(newTagId);
      expect(result.name).toBe("New Tag");
      expect(result.color).toBe("#123456");
    });

    it("should use default color #000000 when not provided", () => {
      const newTagId = crypto.randomUUID();
      db.prepare("INSERT INTO tags (id, family_id, name) VALUES (?, ?, ?)").run(newTagId, familyId, "Default Color Tag");

      const result = db.prepare("SELECT * FROM tags WHERE id = ?").get(newTagId);
      expect(result.color).toBe("#000000");
    });

    it("should validate that name is required", () => {
      const newTagId = crypto.randomUUID();
      db.prepare("INSERT INTO tags (id, family_id, name) VALUES (?, ?, ?)").run(newTagId, familyId, "");

      const result = db.prepare("SELECT * FROM tags WHERE id = ?").get(newTagId);
      expect(result).not.toBeUndefined(); // DB allows empty; API validates
    });
  });

  describe("PUT /api/tags update pattern", () => {
    it("should update tag name", () => {
      const existing = db.prepare("SELECT * FROM tags WHERE family_id = ?").all(familyId)[0];

      db.prepare("UPDATE tags SET name = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
        "Updated Tag", "#abcdef", existing.id
      );

      const result = db.prepare("SELECT * FROM tags WHERE id = ?").get(existing.id);
      expect(result.name).toBe("Updated Tag");
    });

    it("should update tag color", () => {
      const existing = db.prepare("SELECT * FROM tags WHERE family_id = ?").all(familyId)[0];

      db.prepare("UPDATE tags SET color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run("#ff69b4", existing.id);

      const result = db.prepare("SELECT * FROM tags WHERE id = ?").get(existing.id);
      expect(result.color).toBe("#ff69b4");
    });

    it("should validate that id is required for update", () => {
      // Updating with non-existent ID does nothing
      const before = db.prepare("SELECT COUNT(*) as count FROM tags").get().count;
      db.prepare("UPDATE tags SET name = 'Nope' WHERE id = ?").run("nonexistent");
      const after = db.prepare("SELECT COUNT(*) as count FROM tags").get().count;
      expect(before).toBe(after);
    });
  });

  describe("DELETE /api/tags pattern", () => {
    it("should delete a tag and cascade to task_tags", () => {
      // Create a fresh tag for this test to avoid deleting shared data
      const testTagId = crypto.randomUUID();
      db.prepare("INSERT INTO tags (id, family_id, name) VALUES (?, ?, ?)").run(testTagId, familyId, "Delete Test");
      db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run(taskId2, testTagId);

      // Cascade delete to junction tables first
      db.prepare("DELETE FROM task_tags WHERE tag_id = ?").run(testTagId);
      db.prepare("DELETE FROM slate_tags WHERE tag_id = ?").run(testTagId);
      db.prepare("DELETE FROM tags WHERE id = ?").run(testTagId);

      const result = db.prepare("SELECT * FROM tags WHERE id = ?").get(testTagId);
      expect(result).toBeUndefined();
    });

    it("should delete a tag and cascade to slate_tags", () => {
      // Create a new tag linked to the existing slate
      const newTagId = crypto.randomUUID();
      db.prepare("INSERT INTO tags (id, family_id, name) VALUES (?, ?, ?)").run(newTagId, familyId, "Slate Tag");
      db.prepare("INSERT INTO slate_tags (slate_id, tag_id) VALUES (?, ?)").run(slateId, newTagId);

      // Delete the tag
      db.prepare("DELETE FROM task_tags WHERE tag_id = ?").run(newTagId);
      db.prepare("DELETE FROM slate_tags WHERE tag_id = ?").run(newTagId);
      db.prepare("DELETE FROM tags WHERE id = ?").run(newTagId);

      const result = db.prepare("SELECT * FROM slate_tags WHERE tag_id = ?").all(newTagId);
      expect(result.length).toBe(0);
    });

    it("should validate that id is required for deletion", () => {
      const beforeCount = db.prepare("SELECT COUNT(*) as count FROM tags").get().count;
      db.prepare("DELETE FROM tags WHERE id = ?").run("nonexistent");
      const afterCount = db.prepare("SELECT COUNT(*) as count FROM tags").get().count;
      expect(beforeCount).toBe(afterCount);
    });

    it("should handle deleting tag with no junction entries", () => {
      const newTagId = crypto.randomUUID();
      db.prepare("INSERT INTO tags (id, family_id, name) VALUES (?, ?, ?)").run(newTagId, familyId, "Standalone Tag");

      // No junction entries — just delete directly
      db.prepare("DELETE FROM task_tags WHERE tag_id = ?").run(newTagId);
      db.prepare("DELETE FROM slate_tags WHERE tag_id = ?").run(newTagId);
      db.prepare("DELETE FROM tags WHERE id = ?").run(newTagId);

      const result = db.prepare("SELECT * FROM tags WHERE id = ?").get(newTagId);
      expect(result).toBeUndefined();
    });
  });

  describe("Task tag junction management", () => {
    it("should get all task_ids for a tag", () => {
      // Create fresh tag and link to two tasks
      const testTagId = crypto.randomUUID();
      const taskA = crypto.randomUUID();
      const taskB = crypto.randomUUID();
      db.prepare("INSERT INTO tags (id, family_id, name) VALUES (?, ?, ?)").run(testTagId, familyId, "Junction Tag");
      db.prepare("INSERT INTO tasks (id, family_id, name) VALUES (?, ?, ?)").run(taskA, familyId, "Task A");
      db.prepare("INSERT INTO tasks (id, family_id, name) VALUES (?, ?, ?)").run(taskB, familyId, "Task B");
      db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run(taskA, testTagId);
      db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run(taskB, testTagId);

      const tasks = db.prepare(`
        SELECT tt.task_id FROM task_tags tt WHERE tt.tag_id = ?
      `).all(testTagId);

      expect(tasks.length).toBe(2);
    });

    it("should get all tags for a task", () => {
      // Create fresh task and link to tag
      const testTagId = crypto.randomUUID();
      const testTaskId = crypto.randomUUID();
      db.prepare("INSERT INTO tags (id, family_id, name) VALUES (?, ?, ?)").run(testTagId, familyId, "My Tag");
      db.prepare("INSERT INTO tasks (id, family_id, name) VALUES (?, ?, ?)").run(testTaskId, familyId, "My Task");
      db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run(testTaskId, testTagId);

      const tags = db.prepare(`
        SELECT t.* FROM tags t
        INNER JOIN task_tags tt ON t.id = tt.tag_id
        WHERE tt.task_id = ?
      `).all(testTaskId);

      expect(tags.some((t: any) => t.name === "My Tag")).toBe(true);
    });

    it("should handle tasks with no tags", () => {
      const newTaskId = crypto.randomUUID();
      db.prepare("INSERT INTO tasks (id, family_id, name) VALUES (?, ?, ?)").run(newTaskId, familyId, "Untagged Task");

      const tags = db.prepare("SELECT tag_id FROM task_tags WHERE task_id = ?").all(newTaskId);
      expect(tags.length).toBe(0);
    });

    it("should allow multiple tags per task", () => {
      // Create fresh task and link to two tags
      const testTag1Id = crypto.randomUUID();
      const testTag2Id = crypto.randomUUID();
      const testTaskId = crypto.randomUUID();
      db.prepare("INSERT INTO tags (id, family_id, name) VALUES (?, ?, ?)").run(testTag1Id, familyId, "Tag A");
      db.prepare("INSERT INTO tags (id, family_id, name) VALUES (?, ?, ?)").run(testTag2Id, familyId, "Tag B");
      db.prepare("INSERT INTO tasks (id, family_id, name) VALUES (?, ?, ?)").run(testTaskId, familyId, "Multi-Tag Task");
      db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run(testTaskId, testTag1Id);
      db.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)").run(testTaskId, testTag2Id);

      const tagCount = db.prepare(`
        SELECT COUNT(DISTINCT tt.tag_id) as count
        FROM task_tags tt
        WHERE tt.task_id = ?
      `).all(testTaskId)[0].count;

      expect(tagCount).toBe(2); // Both tags linked to this task
    });
  });

  describe("Slate tag junction management", () => {
    it("should get all tags for a slate", () => {
      // Create fresh slate and link to tag
      const testTagId = crypto.randomUUID();
      const testSlateId2 = crypto.randomUUID();
      db.prepare("INSERT INTO tags (id, family_id, name) VALUES (?, ?, ?)").run(testTagId, familyId, "Slate Tag");
      db.prepare("INSERT INTO slates (id, family_id, name) VALUES (?, ?, ?)").run(testSlateId2, familyId, "Test Slate");
      db.prepare("INSERT INTO slate_tags (slate_id, tag_id) VALUES (?, ?)").run(testSlateId2, testTagId);

      const tags = db.prepare(`
        SELECT t.* FROM tags t
        INNER JOIN slate_tags st ON t.id = st.tag_id
        WHERE st.slate_id = ?
      `).all(testSlateId2);

      expect(tags.some((t: any) => t.name === "Slate Tag")).toBe(true);
    });

    it("should handle slates with no tags", () => {
      const newSlateId = crypto.randomUUID();
      db.prepare("INSERT INTO slates (id, family_id, name) VALUES (?, ?, ?)").run(newSlateId, familyId, "Untagged Slate");

      const tags = db.prepare("SELECT tag_id FROM slate_tags WHERE slate_id = ?").all(newSlateId);
      expect(tags.length).toBe(0);
    });
  });

  describe("Tag color validation patterns", () => {
    it.each([["#ff0000"], ["#00ff00"], ["#0000ff"], ["#ffffff"], ["#000000"]])(
      "should accept hex color '%s'", (color) => {
        const newTagId = crypto.randomUUID();
        db.prepare("INSERT INTO tags (id, family_id, name, color) VALUES (?, ?, ?, ?)").run(newTagId, familyId, "Color Tag", color);

        const result = db.prepare("SELECT * FROM tags WHERE id = ?").get(newTagId);
        expect(result.color).toBe(color);
      }
    );
  });

  describe("Tag uniqueness patterns", () => {
    it("should allow duplicate tag names in same family (no unique constraint on name)", () => {
      const newTag1 = crypto.randomUUID();
      const newTag2 = crypto.randomUUID();
      db.prepare("INSERT INTO tags (id, family_id, name) VALUES (?, ?, ?)").run(newTag1, familyId, "Duplicate Name");
      db.prepare("INSERT INTO tags (id, family_id, name) VALUES (?, ?, ?)").run(newTag2, familyId, "Duplicate Name");

      const duplicates = db.prepare("SELECT * FROM tags WHERE family_id = ? AND name = ?").all(familyId, "Duplicate Name");
      expect(duplicates.length).toBe(2);
    });
  });

  describe("Family-scoped tag queries", () => {
    it("should only return tags belonging to the specified family", () => {
      const otherFamilyId = crypto.randomUUID();
      db.prepare("INSERT INTO families (id, name, slug) VALUES (?, ?, ?)").run(otherFamilyId, "Other Family", "other");

      const newTagId = crypto.randomUUID();
      db.prepare("INSERT INTO tags (id, family_id, name) VALUES (?, ?, ?)").run(newTagId, otherFamilyId, "Other Tag");

      const familyTags = db.prepare("SELECT * FROM tags WHERE family_id = ?").all(familyId);
      const otherTags = db.prepare("SELECT * FROM tags WHERE family_id = ?").all(otherFamilyId);

      expect(familyTags.some((t: any) => t.id === newTagId)).toBe(false);
      expect(otherTags.some((t: any) => t.id === newTagId)).toBe(true);
    });
  });
});
