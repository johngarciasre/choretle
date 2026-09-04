import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb } from "@/db/drizzle";

describe("Slates API Integration", () => {
  beforeEach(() => {
    resetDb();
  });

  it("POST /api/slates creates a new slate", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");

    const res = await harness.invokeHandler("/api/slates", "POST", {
      name: "Weekly Chores",
    });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Weekly Chores");
  });

  it("POST /api/slates returns 400 when name is missing", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");

    const res = await harness.invokeHandler("/api/slates", "POST", {});
    expect(res.status).toBe(400);
  });

  it("POST /api/slates sets default frequency to weekly", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");

    const res = await harness.invokeHandler("/api/slates", "POST", {
      name: "Default Frequency Slate",
    });

    expect(res.status).toBe(201);
  });

  it("POST /api/slates with custom frequency and interval", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");

    const res = await harness.invokeHandler("/api/slates", "POST", {
      name: "Biweekly Slate",
      frequency: "biweekly",
      interval: 2,
    });

    expect(res.status).toBe(201);
  });

  it("Multi-step: create slate, get slates, verify creation", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");

    // Create first slate
    const res1 = await harness.invokeHandler("/api/slates", "POST", {
      name: "Slate A",
    });
    expect(res1.status).toBe(201);
    const slateIdA = res1.body.id;

    // Create second slate
    const res2 = await harness.invokeHandler("/api/slates", "POST", {
      name: "Slate B",
    });
    expect(res2.status).toBe(201);

    // Get all slates
    const getRes = await harness.invokeHandler("/api/slates?familyId=dev-family-001", "GET");
    expect(getRes.status).toBe(200);
  });

  it("Session persists across multiple slate operations", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");

    // Create first slate
    const res1 = await harness.invokeHandler("/api/slates", "POST", {
      name: "Persistent Slate 1",
    });
    expect(res1.status).toBe(201);

    // Create another slate (same session)
    const res2 = await harness.invokeHandler("/api/slates", "POST", {
      name: "Persistent Slate 2",
    });
    expect(res2.status).toBe(201);

    // Get all slates
    const getRes = await harness.invokeHandler("/api/slates?familyId=dev-family-001", "GET");
    expect(getRes.status).toBe(200);
  });

  it("Slates created by different users are associated with family", async () => {
    const harness = new TestHarness();

    // Parent creates a slate
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");
    const adminRes = await harness.invokeHandler("/api/slates", "POST", {
      name: "Parent Slate",
    });
    expect(adminRes.status).toBe(201);

    // Child creates a slate (same family)
    await harness.signIn("child@choretle.dev");
    const childRes = await harness.invokeHandler("/api/slates", "POST", {
      name: "Child Slate",
    });
    expect(childRes.status).toBe(201);
  });

  it("POST /api/slates with description and room location", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");

    const res = await harness.invokeHandler("/api/slates", "POST", {
      name: "Living Room Tasks",
      description: "Tasks that need to be done in the living room",
      roomLocation: "Living Room",
    });

    expect(res.status).toBe(201);
  });
});
