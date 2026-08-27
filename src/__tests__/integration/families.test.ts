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

    const res = await harness.invokeHandler("/api/family", "POST", {
      name: "My Test Family",
      slug: "my-test-family",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.family.name).toBe("My Test Family");
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

    // Create a family first
    const createRes = await harness.invokeHandler("/api/family", "POST", {
      name: "Get Family Test",
      slug: "get-family-test",
    });
    expect(createRes.status).toBe(200);

    const familyId = createRes.body.family.id;
    expect(familyId).toBeTruthy();

    // Get the family by ID
    const getRes = await harness.invokeHandler(`/api/family?id=${familyId}`, "GET");
    expect(getRes.status).toBe(200);
    expect(getRes.body.family.name).toBe("Get Family Test");
  });

  it("POST /api/family generates slug from name", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    const res = await harness.invokeHandler("/api/family", "POST", {
      name: "My Cool Family Name",
    });

    expect(res.status).toBe(200);
    expect(res.body.family.slug).toBeTruthy();
  });

  it("Multi-step: create family, get family, verify association", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    // Create a family
    const createRes = await harness.invokeHandler("/api/family", "POST", {
      name: "Multi-step Family",
    });
    expect(createRes.status).toBe(200);

    const familyId = createRes.body.family.id;
    expect(familyId).toBeTruthy();

    // Get the family by ID
    const getRes = await harness.invokeHandler(`/api/family?id=${familyId}`, "GET");
    expect(getRes.status).toBe(200);
    expect(getRes.body.family.name).toBe("Multi-step Family");
  });

  it("Session persists across multiple requests", async () => {
    const harness = new TestHarness();
    await harness.signIn("parent@choretle.dev");
    expect(harness.getCookieJar().get("dev-session")).toBeTruthy();

    // Create a family
    const res1 = await harness.invokeHandler("/api/family", "POST", {
      name: "Persistent Family 1",
    });
    expect(res1.status).toBe(200);

    // Create another family in the same session
    const res2 = await harness.invokeHandler("/api/family", "POST", {
      name: "Persistent Family 2",
    });
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
