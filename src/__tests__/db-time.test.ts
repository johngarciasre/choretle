import { describe, expect, it } from "vitest";
import { timestamptzToIso } from "@/db";

/**
 * Postgres sends a UTC offset as `+00`, which `new Date()` rejects. Every
 * timestamptz read went through this parser, so a live server threw on the
 * first real row while the PGlite tests stayed green.
 */
describe("Postgres timestamp normalisation", () => {
  it("accepts the +00 offset Postgres actually sends", () => {
    expect(timestamptzToIso("2026-11-27 04:55:39.224+00")).toBe("2026-11-27T04:55:39.224Z");
  });

  it("accepts a full +00:00 offset", () => {
    expect(timestamptzToIso("2026-11-27 04:55:39+00:00")).toBe("2026-11-27T04:55:39.000Z");
  });

  it("treats a naked timestamp as UTC when asked", () => {
    expect(timestamptzToIso("2026-11-27 04:55:39.5", true)).toBe("2026-11-27T04:55:39.500Z");
  });

  it("keeps a non-UTC offset", () => {
    expect(timestamptzToIso("2026-11-27 04:55:39+05:30")).toBe("2026-11-26T23:25:39.000Z");
  });

  it("throws on garbage instead of silently producing Invalid Date", () => {
    expect(() => timestamptzToIso("not a date")).toThrow(/unparseable timestamp/);
  });
});
