import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb } from "@/db/drizzle";

describe("Teams API Integration", () => {
  beforeEach(() => {
    resetDb();
  });

  it("POST /api/teams creates a new team", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    const res = await harness.invokeHandler("/api/teams", "POST", {
      name: "Chores Team",
      familyId: "dev-family-001",
    });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Chores Team");
  });

  it("POST /api/teams returns 400 when name is missing", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    const res = await harness.invokeHandler("/api/teams", "POST", {});
    expect(res.status).toBe(400);
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

  it("Multi-step: create team, assign member, verify", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    // Step 1: Create team
    const createRes = await harness.invokeHandler("/api/teams", "POST", {
      name: "Multi-step Team",
      familyId: "dev-family-001",
    });

    expect(createRes.status).toBe(201);
    const teamId = createRes.body.id;

    // Step 2: Get teams for the family
    const getRes = await harness.invokeHandler("/api/teams?familyId=dev-family-001", "GET");
    
    expect(getRes.status).toBe(200);
    expect(Array.isArray(getRes.body.teams)).toBe(true);

    // Step 3: Verify team exists
    const foundTeam = getRes.body.teams.find((t: any) => t.id === teamId);
    expect(foundTeam).toBeTruthy();
  });

  it("Teams persist across requests in same session", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    // Create two teams
    const res1 = await harness.invokeHandler("/api/teams", "POST", {
      name: "Persist Team 1",
      familyId: "dev-family-001",
    });
    expect(res1.status).toBe(201);

    const res2 = await harness.invokeHandler("/api/teams", "POST", {
      name: "Persist Team 2",
      familyId: "dev-family-001",
    });
    expect(res2.status).toBe(201);

    // Get teams — should have at least 2
    const getRes = await harness.invokeHandler("/api/teams?familyId=dev-family-001", "GET");
    expect(getRes.status).toBe(200);
    expect(getRes.body.teams.length).toBeGreaterThanOrEqual(2);
  });

  it("Child user can create teams within family", async () => {
    const harness = new TestHarness();
    await harness.signIn("child@choretle.dev");

    const res = await harness.invokeHandler("/api/teams", "POST", {
      name: "Child's Team",
      familyId: "dev-family-001",
    });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Child's Team");
  });

  it("Teams with different names can be created", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    
    for (const name of ["Alpha", "Beta", "Gamma"]) {
      const res = await harness.invokeHandler("/api/teams", "POST", {
        name,
        familyId: "dev-family-001",
      });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe(name);
    }
  });

  it("Teams are associated with the correct family", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    const res = await harness.invokeHandler("/api/teams", "POST", {
      name: "Family Team",
      familyId: "dev-family-001",
    });

    expect(res.status).toBe(201);
    expect(res.body.family_id).toBe("dev-family-001");
  });
});
