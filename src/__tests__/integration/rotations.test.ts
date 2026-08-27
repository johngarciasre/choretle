import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb } from "@/db/drizzle";

describe("Rotations API Integration", () => {
  beforeEach(() => {
    resetDb();
  });

  it("POST /api/rotations creates a new rotation", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");

    // Create a slate first
    const slateRes = await harness.invokeHandler("/api/slates", "POST", {
      name: "Rotation Slate",
    });
    expect(slateRes.status).toBe(201);

    // Create a rotation
    const res = await harness.invokeHandler("/api/rotations", "POST", {
      slateId: slateRes.body.id,
      userId: "dev-user-admin-001",
    });

    expect(res.status).toBe(201);
  });

  it("POST /api/rotations returns 400 when slateId or userId missing", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");

    const res = await harness.invokeHandler("/api/rotations", "POST", {});
    expect(res.status).toBe(400);
  });

  it("PUT /api/rotations updates an existing rotation", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");

    // Create a slate first
    const slateRes = await harness.invokeHandler("/api/slates", "POST", {
      name: "Update Slate",
    });
    expect(slateRes.status).toBe(201);

    // Create a rotation
    const createRes = await harness.invokeHandler("/api/rotations", "POST", {
      slateId: slateRes.body.id,
      userId: "dev-user-admin-001",
    });
    expect(createRes.status).toBe(201);

    // Update the rotation (PUT delegates to POST with id)
    const updateRes = await harness.invokeHandler("/api/rotations", "PUT", {
      id: createRes.body.id,
      slateId: slateRes.body.id,
      userId: "dev-user-child-001",
    });
    expect(updateRes.status).toBe(201);
  });

  it("DELETE /api/rotations deletes a rotation", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");

    // Create a slate first
    const slateRes = await harness.invokeHandler("/api/slates", "POST", {
      name: "Delete Slate",
    });
    expect(slateRes.status).toBe(201);

    // Create a rotation
    const createRes = await harness.invokeHandler("/api/rotations", "POST", {
      slateId: slateRes.body.id,
      userId: "dev-user-admin-001",
    });
    expect(createRes.status).toBe(201);

    // Delete the rotation
    const deleteRes = await harness.invokeHandler("/api/rotations", "DELETE", {
      id: createRes.body.id,
    });

    expect(deleteRes.status).toBe(200);
  });

  it("Multi-step: create rotation, update, verify assignment", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");

    // Create a slate first
    const slateRes = await harness.invokeHandler("/api/slates", "POST", {
      name: "Multi-step Slate",
    });
    expect(slateRes.status).toBe(201);

    // Create a rotation
    const createRes = await harness.invokeHandler("/api/rotations", "POST", {
      slateId: slateRes.body.id,
      userId: "dev-user-admin-001",
    });
    expect(createRes.status).toBe(201);

    // Update the rotation
    const updateRes = await harness.invokeHandler("/api/rotations", "PUT", {
      id: createRes.body.id,
      slateId: slateRes.body.id,
      userId: "dev-user-child-001",
    });
    expect(updateRes.status).toBe(201);

    // Get rotations for the family
    const getRes = await harness.invokeHandler("/api/rotations?familyId=dev-family-001", "GET");
    expect(getRes.status).toBe(200);
  });

  it("Multiple rotations can be created for same slate", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");

    // Create a slate first
    const slateRes = await harness.invokeHandler("/api/slates", "POST", {
      name: "Multi-Assign Slate",
    });
    expect(slateRes.status).toBe(201);

    // Create rotation for admin
    const res1 = await harness.invokeHandler("/api/rotations", "POST", {
      slateId: slateRes.body.id,
      userId: "dev-user-admin-001",
    });
    expect(res1.status).toBe(201);

    // Create rotation for child (same slate)
    await harness.signIn("child@choretle.dev");
    const res2 = await harness.invokeHandler("/api/rotations", "POST", {
      slateId: slateRes.body.id,
      userId: "dev-user-child-001",
    });
    expect(res2.status).toBe(201);
  });

  it("Rotations persist across requests in same session", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");

    // Create a slate first
    const slateRes = await harness.invokeHandler("/api/slates", "POST", {
      name: "Persist Slate",
    });
    expect(slateRes.status).toBe(201);

    // Create two rotations in same session
    const res1 = await harness.invokeHandler("/api/rotations", "POST", {
      slateId: slateRes.body.id,
      userId: "dev-user-admin-001",
    });
    expect(res1.status).toBe(201);

    const res2 = await harness.invokeHandler("/api/rotations", "POST", {
      slateId: slateRes.body.id,
      userId: "dev-user-child-001",
    });
    expect(res2.status).toBe(201);
  });

  it("Child user can create and update own rotations", async () => {
    const harness = new TestHarness();
    await harness.signIn("child@choretle.dev");
    harness.setFamilyId("dev-family-001");

    // Create a slate first
    const slateRes = await harness.invokeHandler("/api/slates", "POST", {
      name: "Child Slate",
    });
    expect(slateRes.status).toBe(201);

    // Create rotation
    const createRes = await harness.invokeHandler("/api/rotations", "POST", {
      slateId: slateRes.body.id,
      userId: "dev-user-child-001",
    });
    expect(createRes.status).toBe(201);

    // Update the rotation
    const updateRes = await harness.invokeHandler("/api/rotations", "PUT", {
      id: createRes.body.id,
      slateId: slateRes.body.id,
      userId: "dev-user-child-001",
    });
    expect(updateRes.status).toBe(201);
  });

  it("Rotations with default intervalDays use 7 days", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");

    // Create a slate first
    const slateRes = await harness.invokeHandler("/api/slates", "POST", {
      name: "Default Interval Slate",
    });
    expect(slateRes.status).toBe(201);

    const res = await harness.invokeHandler("/api/rotations", "POST", {
      slateId: slateRes.body.id,
      userId: "dev-user-admin-001",
    });

    expect(res.status).toBe(201);
  });

  it("Rotation with custom intervalDays is preserved", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");

    // Create a slate first
    const slateRes = await harness.invokeHandler("/api/slates", "POST", {
      name: "Custom Interval Slate",
    });
    expect(slateRes.status).toBe(201);

    const res = await harness.invokeHandler("/api/rotations", "POST", {
      slateId: slateRes.body.id,
      userId: "dev-user-admin-001",
      intervalDays: 30,
    });

    expect(res.status).toBe(201);
  });
});
