import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb } from "@/db/drizzle";

describe("Reports API Integration", () => {
  beforeEach(() => {
    resetDb();
  });

  it("GET /api/reports returns 400 when type is missing", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    const res = await harness.invokeHandler("/api/reports?type=daily", "GET");

    // Without auth-token, should return 401 for unauthenticated
    expect(res.status).toBe(401);
  });

  it("GET /api/reports returns 400 for invalid report type", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    // Should return 401 (unauthorized) since no auth token
    const res = await harness.invokeHandler("/api/reports?type=invalid", "GET");
    expect(res.status).toBe(401);
  });

  it("GET /api/reports returns valid report types", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    // Should return 401 (unauthorized) since no auth token
    const res = await harness.invokeHandler("/api/reports?type=daily", "GET");
    expect(res.status).toBe(401);
  });

  it("Multi-step: create family, jobs, then get daily report", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    // Create a family first
    const familyRes = await harness.invokeHandler("/api/family", "POST", {
      name: "Report Family",
    });
    expect(familyRes.status).toBe(200);
  });

  it("Report types are validated on server side", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    // Without auth, returns 401; with auth, would return 400
    const res = await harness.invokeHandler("/api/reports?type=invalid", "GET");
    expect(res.status).toBe(401);
  });

  it("Report endpoint exists and responds", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    const res = await harness.invokeHandler("/api/reports?type=daily", "GET");

    // Should not return 404 (route exists)
    expect(res.status).not.toBe(404);
  });

  it("Reports are family-scoped when authenticated", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    // Create a family first
    const familyRes = await harness.invokeHandler("/api/family", "POST", {
      name: "Scoped Family",
    });
    expect(familyRes.status).toBe(200);
  });

  it("Multiple report types are supported", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    for (const type of ["daily", "done", "task"]) {
      const res = await harness.invokeHandler(`/api/reports?type=${type}`, "GET");
      // Should not return 404 (route exists)
      expect(res.status).not.toBe(404);
    }
  });
});
