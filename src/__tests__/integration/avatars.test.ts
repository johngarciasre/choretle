import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb } from "@/db";
import { signInAndGetHousehold } from "./fixtures";

describe("Avatar files", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("serves a cast portrait to a signed-in member", async () => {
    const harness = new TestHarness();
    await signInAndGetHousehold(harness);

    const res = await harness.invokeHandler("/api/avatars/[file]", "GET", undefined, { file: "u-mike.jpg" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    // Browser-only caching: a shared proxy must not keep a copy.
    expect(res.headers["cache-control"]).toContain("private");
    expect(res.body.length).toBeGreaterThan(1000);
  });

  it("refuses anonymous visitors", async () => {
    const anonymous = new TestHarness();
    const res = await anonymous.invokeHandler("/api/avatars/[file]", "GET", undefined, { file: "u-mike.jpg" });
    expect(res.status).toBe(401);
    expect(res.body).toBe("");
  });

  it("rejects names that are not a plain image file", async () => {
    const harness = new TestHarness();
    await signInAndGetHousehold(harness);

    for (const file of ["../../package.json", "CREDITS.md", "u-mike.svg", "u-mike.jpg/../x", ""]) {
      const res = await harness.invokeHandler("/api/avatars/[file]", "GET", undefined, { file });
      expect(res.status, `file=${file}`).toBe(404);
    }
  });
});
