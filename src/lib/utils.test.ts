import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/slugify";
import * as schema from "@/db/schema";

describe("cn utility function", () => {
  it("should merge class names correctly", () => {
    expect(cn("text-red-500", "text-blue-600")).toBe("text-blue-600");
    expect(cn("font-bold", "")).toBe("font-bold");
    expect(cn(false, "test")).toBe("test");
    expect(cn(["conditional"], true)).toBe("conditional");
  });

  it("should handle conditional classes", () => {
    expect(cn("base-class", true && "active-class")).toBe("base-class active-class");
    expect(cn("base-class", false && "active-class")).toBe("base-class");
  });

  it("should handle mixed array types", () => {
    expect(cn(["a", "b"], "c", ["d", false, null])).toBe("a b c d");
  });

  it("should return empty string for no arguments", () => {
    expect(cn()).toBe("");
    expect(cn("", undefined)).toBe("");
  });

  it("should handle nested arrays with falsy values", () => {
    expect(cn(["a", false, ["nested"], null, "b"])).toBe("a nested b");
  });
});

describe("slugify utility function", () => {
  describe("basic behavior", () => {
    it("converts spaces to hyphens and lowercases", () => {
      expect(slugify("My Family")).toBe("my-family");
      expect(slugify("Hello World")).toBe("hello-world");
    });

    it("preserves existing slugs unchanged", () => {
      expect(slugify("hello-world")).toBe("hello-world");
      expect(slugify("already-slugified")).toBe("already-slugified");
    });

    it("handles strings with numbers", () => {
      expect(slugify("Test123")).toBe("test123");
      expect(slugify("Family 2024")).toBe("family-2024");
    });
  });

  describe("special characters", () => {
    it("replaces special characters with hyphens (consecutive chars become single hyphen)", () => {
      expect(slugify("O'Brien & Co!")).toBe("o-brien-co");
      expect(slugify("Hello, World!@#")).toBe("hello-world");
    });

    it("handles unicode and accented characters", () => {
      expect(slugify("café résumé naïve")).toBe("caf-r-sum-na-ve");
    });

    it("converts multiple consecutive non-alphanumeric chars to single hyphen", () => {
      expect(slugify("hello   world")).toBe("hello-world");
      expect(slugify("hello---world")).toBe("hello-world");
      expect(slugify("hello...world")).toBe("hello-world");
    });

    it("trims leading and trailing whitespace", () => {
      expect(slugify("  My Family  ")).toBe("my-family");
    });

    it("removes leading and trailing hyphens", () => {
      expect(slugify(" MyFamily")).toBe("myfamily");
      expect(slugify("MyFamily ")).toBe("myfamily");
    });
  });

  describe("edge cases", () => {
    it("returns empty string for empty or whitespace input", () => {
      expect(slugify("")).toBe("");
      expect(slugify("   ")).toBe("");
      expect(slugify(null as unknown as string)).toBe("");
      expect(slugify(undefined as unknown as string)).toBe("");
    });

    it("handles strings with only special characters", () => {
      expect(slugify("@#$%&")).toBe("");
      expect(slugify("!@#")).toBe("");
    });

    it("handles single character input", () => {
      expect(slugify("A")).toBe("a");
      expect(slugify("1")).toBe("1");
      expect(slugify("-")).toBe("");
    });

    it("preserves non-alphanumeric characters that are not spaces or hyphens", () => {
      // Characters like é and ñ get normalized by the regex but keep letters
      expect(slugify("naïve")).toBe("na-ve");
    });
  });

  describe("truncation", () => {
    it("does not truncate unless text exceeds maxLength", () => {
      const result = slugify("hello world", 20);
      expect(result).toBe("hello-world");
    });

    it("truncates to maxLength when exceeded", () => {
      const longName = "a".repeat(100);
      const result = slugify(longName, 50);
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it("backs up to last hyphen to avoid mid-word truncation", () => {
      const longSlug = "hello-world-this-is-a-very-long-family-name";
      const result = slugify(longSlug, 10);
      // Should truncate at the hyphen before "world" (position 6) not at position 10
      expect(result).toBe("hello");
    });

    it("handles truncation when no hyphens exist", () => {
      const result = slugify("hellothereisaverylongword", 10);
      expect(result.length).toBeLessThanOrEqual(9); // maxLength - 1 for safety
    });

    it("preserves trailing hyphens after truncation backup", () => {
      const result = slugify("a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-r-s-t-u-v-w-x-y-z", 20);
      expect(result).not.toMatch(/^-+|-+$/); // No leading or trailing hyphens
    });
  });

  describe("boundary conditions", () => {
    it("handles maxLength of 1", () => {
      const result = slugify("hello", 1);
      expect(result).toBe("h");
    });

    it("handles maxLength of 0", () => {
      const result = slugify("hello", 0);
      expect(result).toBe("");
    });

    it("handles extremely long strings with default maxLength (80)", () => {
      const longString = "The ".repeat(50); // ~250 chars
      const result = slugify(longString, 80);
      expect(result.length).toBeLessThanOrEqual(80);
    });

    it("handles strings with mixed alphanumeric and special characters", () => {
      const complex = "Hello World! This is @test #123 - Family";
      const result = slugify(complex, 50);
      expect(result).not.toContain("!");
      expect(result).not.toContain("@");
      expect(result).not.toContain("#");
    });
  });
});

describe("Schema exports", () => {
  it("should export all required tables", () => {
    expect(schema.families).toBeDefined();
    expect(schema.users).toBeDefined();
    expect(schema.teams).toBeDefined();
    expect(schema.tasks).toBeDefined();
    expect(schema.subtasks).toBeDefined();
    expect(schema.slates).toBeDefined();
    expect(schema.jobs).toBeDefined();
    expect(schema.reports).toBeDefined();
  });

  it("should have id column for all tables", () => {
    const tables = [schema.families, schema.users, schema.teams, schema.tasks, schema.subtasks, schema.slates, schema.jobs, schema.reports];
    tables.forEach(table => {
      expect(table.id).toBeDefined();
    });
  });
});
