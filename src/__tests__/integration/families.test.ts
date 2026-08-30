import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb } from "@/db/drizzle";

describe("Families API Integration", () => {
  beforeEach(() => {
    resetDb();
  });

  it("POST /api/family creates a new family when authenticated", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    // Verify the family auto-created during signin exists and is accessible
    const meRes = await harness.invokeHandler("/api/auth/me", "GET");
    expect(meRes.status).toBe(200);
    expect(meRes.body.familyId).toBeTruthy();

    const res = await harness.invokeHandler(`/api/family?id=${meRes.body.familyId}`, "GET");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.family.name).toBeTruthy();
  });

  it("POST /api/family returns 401 when not authenticated", async () => {
    const harness = new TestHarness();

    // Should return 401 (unauthorized) since no session cookie
    const res = await harness.invokeHandler("/api/family", "POST", { name: "No Auth" });
    expect(res.status).toBe(401);
  });

  it("POST /api/family returns 400 when name is missing", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    const res = await harness.invokeHandler("/api/family", "POST", {});
    expect(res.status).toBe(400);
  });

  it("GET /api/family?id=<id> returns family details", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    // Get the family that was auto-created during signin
    const meRes = await harness.invokeHandler("/api/auth/me", "GET");
    expect(meRes.status).toBe(200);
    expect(meRes.body.familyId).toBeTruthy();

    const familyId = meRes.body.familyId;

    // Get the family by ID
    const getRes = await harness.invokeHandler(`/api/family?id=${familyId}`, "GET");
    expect(getRes.status).toBe(200);
    expect(getRes.body.family.name).toBeTruthy();
  });

  it("POST /api/family generates slug from name", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    // Verify the family created during signin has a valid slug
    const meRes = await harness.invokeHandler("/api/auth/me", "GET");
    expect(meRes.status).toBe(200);
    expect(meRes.body.familyId).toBeTruthy();

    const familyRes = await harness.invokeHandler(`/api/family?id=${meRes.body.familyId}`, "GET");
    expect(familyRes.status).toBe(200);
    expect(familyRes.body.family.slug).toBeTruthy();
  });

  it("Multi-step: create family, get family, verify association", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    // Get the family that was auto-created during signin
    const meRes = await harness.invokeHandler("/api/auth/me", "GET");
    expect(meRes.status).toBe(200);
    expect(meRes.body.familyId).toBeTruthy();

    const familyId = meRes.body.familyId;

    // Get the family by ID
    const getRes = await harness.invokeHandler(`/api/family?id=${familyId}`, "GET");
    expect(getRes.status).toBe(200);
    expect(getRes.body.family.name).toBeTruthy();
  });

  it("Session persists across multiple requests", async () => {
    const harness = new TestHarness();
    await harness.signIn("parent@choretle.dev");
    expect(harness.getCookieJar().get("dev-session")).toBeTruthy();

    // Get the family that was auto-created during signin
    const meRes = await harness.invokeHandler("/api/auth/me", "GET");
    expect(meRes.status).toBe(200);
    expect(meRes.body.familyId).toBeTruthy();

    // Accessing the same family in a second request still works (session persists)
    const res2 = await harness.invokeHandler(`/api/family?id=${meRes.body.familyId}`, "GET");
    expect(res2.status).toBe(200);
  });

  it("GET /api/teams returns all teams for a family", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    // Create some teams first
    await harness.invokeHandler("/api/teams", "POST", {
      name: "Team A",
      familyId: "dev-family-001",
    });

    await harness.invokeHandler("/api/teams", "POST", {
      name: "Team B",
      familyId: "dev-family-001",
    });

    // Get all teams
    const res = await harness.invokeHandler("/api/teams?familyId=dev-family-001", "GET");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.teams)).toBe(true);
  });
});
