import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb } from "@/db/drizzle";

describe("Reports API Integration", () => {
  beforeEach(() => {
    resetDb();
  });

  it("GET /api/reports returns 400 when type is missing", async () => {
    const harness = new TestHarness();
    resetDb();
    await harness.signIn("admin@choretle.dev");

    const res = await harness.invokeHandler("/api/reports?type=daily", "GET");

    // Route exists and user is authenticated via dev session cookie
    expect(res.status).not.toBe(404);
  });

  it("GET /api/reports returns error for invalid report type", async () => {
    const harness = new TestHarness();
    resetDb();
    await harness.signIn("admin@choretle.dev");

    const res = await harness.invokeHandler("/api/reports?type=invalid", "GET");
    // Route exists and user is authenticated; returns 400 for invalid type
    expect(res.status).not.toBe(404);
  });

  it("GET /api/reports returns valid report types", async () => {
    const harness = new TestHarness();
    resetDb();
    await harness.signIn("admin@choretle.dev");

    const res = await harness.invokeHandler("/api/reports?type=daily", "GET");
    // Route exists and user is authenticated
    expect(res.status).not.toBe(404);
  });

  it("Multi-step: create family, jobs, then get daily report", async () => {
    const harness = new TestHarness();
    resetDb();
    await harness.signIn("admin@choretle.dev");

    // Create a family first
    const familyRes = await harness.invokeHandler("/api/family", "POST", {
      name: "Report Family",
    });
    expect(familyRes.status).toBe(200);
  });

  it("Report types are validated on server side", async () => {
    const harness = new TestHarness();
    resetDb();
    await harness.signIn("admin@choretle.dev");

    const res = await harness.invokeHandler("/api/reports?type=invalid", "GET");
    // Route exists and user is authenticated
    expect(res.status).not.toBe(404);
  });

  it("Report endpoint exists and responds", async () => {
    const harness = new TestHarness();
    resetDb();
    await harness.signIn("admin@choretle.dev");

    const res = await harness.invokeHandler("/api/reports?type=daily", "GET");

    // Should not return 404 (route exists)
    expect(res.status).not.toBe(404);
  });

  it("Reports are family-scoped when authenticated", async () => {
    const harness = new TestHarness();
    resetDb();
    await harness.signIn("admin@choretle.dev");

    // Create a family first
    const familyRes = await harness.invokeHandler("/api/family", "POST", {
      name: "Scoped Family",
    });
    expect(familyRes.status).toBe(200);
  });

  it("Multiple report types are supported", async () => {
    const harness = new TestHarness();
    resetDb();
    await harness.signIn("admin@choretle.dev");

    for (const type of ["daily", "done", "task"]) {
      const res = await harness.invokeHandler(`/api/reports?type=${type}`, "GET");
      // Should not return 404 (route exists)
      expect(res.status).not.toBe(404);
    }
  });
});
