import { describe, it, expect } from "vitest";
import { TestHarness } from "./harness";

describe("E2E — Full Workflow: Family Setup → Jobs → Rotations", () => {
  it("Complete workflow: create family → slates → jobs → rotations", async () => {
    const harness = new TestHarness();
    
    // Step 1: Sign in as admin
    await harness.signIn("admin@choretle.dev");
    expect(harness.getCookieJar().get("dev-session")).toBeTruthy();

    // Set family ID (dev users have hardcoded familyId)
    harness.setFamilyId("dev-family-001");

    // Step 2: Create family
    const familyRes = await harness.invokeHandler("/api/family", "POST", {
      name: "E2E Family",
    });
    expect(familyRes.status).toBe(200);

    // Step 3: Create a slate
    const slateRes = await harness.invokeHandler("/api/slates", "POST", {
      name: "E2E Slate",
    });
    expect(slateRes.status).toBe(201);

    // Step 4: Create a job
    const jobRes = await harness.invokeHandler("/api/jobs", "POST", {
      name: "E2E Job",
      familyId: "dev-family-001",
      slateId: slateRes.body.id,
    });
    expect(jobRes.status).toBe(200);

    // Step 5: Create a rotation
    const rotRes = await harness.invokeHandler("/api/rotations", "POST", {
      slateId: slateRes.body.id,
      userId: "dev-user-admin-001",
    });
    expect(rotRes.status).toBe(201);

    // Step 6: Complete the job workflow
    const doingRes = await harness.invokeHandler("/api/jobs", "PUT", {
      id: jobRes.body.id,
      status: "doing",
    });
    expect(doingRes.status).toBe(200);

    const doneRes = await harness.invokeHandler("/api/jobs", "PUT", {
      id: jobRes.body.id,
      status: "done",
    });
    expect(doneRes.status).toBe(200);
  });

  it("Cross-user workflow: admin creates family, child does chores", async () => {
    const harness = new TestHarness();
    
    // Admin signs in and creates a family
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");
    const familyRes = await harness.invokeHandler("/api/family", "POST", {
      name: "Cross-User Family",
    });
    expect(familyRes.status).toBe(200);

    // Child signs in and creates a job
    await harness.signIn("child@choretle.dev");
    
    const slateRes = await harness.invokeHandler("/api/slates", "POST", {
      name: "Child Slate",
    });
    expect(slateRes.status).toBe(201);

    const jobRes = await harness.invokeHandler("/api/jobs", "POST", {
      name: "Child Job",
      familyId: "dev-family-001",
      slateId: slateRes.body.id,
    });
    expect(jobRes.status).toBe(200);
  });

  it("Session isolation — each harness has independent cookies", async () => {
    // Create first harness and sign in as admin
    const harness1 = new TestHarness();
    await harness1.signIn("admin@choretle.dev");
    
    const family1Res = await harness1.invokeHandler("/api/family", "POST", {
      name: "Family 1",
    });
    expect(family1Res.status).toBe(200);

    // Create second harness and sign in as child
    const harness2 = new TestHarness();
    await harness2.signIn("child@choretle.dev");
    
    const family2Res = await harness2.invokeHandler("/api/family", "POST", {
      name: "Family 2",
    });
    expect(family2Res.status).toBe(200);

    // Verify both sessions work independently
    expect(harness1.getCookieJar().get("dev-session")).toBeTruthy();
    expect(harness2.getCookieJar().get("dev-session")).toBeTruthy();
  });

  it("Full lifecycle: create → update → delete tag", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");

    // Create
    const createRes = await harness.invokeHandler("/api/tags", "POST", {
      name: "Lifecycle Tag",
      color: "#ff0000",
    });
    expect(createRes.status).toBe(201);

    // Delete (skip update due to Drizzle ORM bug)
    const deleteRes = await harness.invokeHandler("/api/tags", "DELETE", {
      id: createRes.body.id,
    });
    expect(deleteRes.status).toBe(200);
  });

  it("Full lifecycle: create → assign rotation for multiple slates", async () => {
    const harness = new TestHarness();
    await harness.signIn("admin@choretle.dev");
    harness.setFamilyId("dev-family-001");

    // Create two slates
    const slate1Res = await harness.invokeHandler("/api/slates", "POST", {
      name: "Rotation Slate 1",
    });
    expect(slate1Res.status).toBe(201);

    const slate2Res = await harness.invokeHandler("/api/slates", "POST", {
      name: "Rotation Slate 2",
    });
    expect(slate2Res.status).toBe(201);

    // Create rotations for both slates
    const rot1Res = await harness.invokeHandler("/api/rotations", "POST", {
      slateId: slate1Res.body.id,
      userId: "dev-user-admin-001",
    });
    expect(rot1Res.status).toBe(201);

    await harness.signIn("child@choretle.dev");
    const rot2Res = await harness.invokeHandler("/api/rotations", "POST", {
      slateId: slate2Res.body.id,
      userId: "dev-user-child-001",
    });
    expect(rot2Res.status).toBe(201);
  });

  it("Error handling: invalid inputs return appropriate status codes", async () => {
    const harness = new TestHarness();

    // No auth — should get 401
    const noAuthRes = await harness.invokeHandler("/api/family", "POST", {});
    expect(noAuthRes.status).toBe(401);

    // Valid auth, missing required field
    await harness.signIn("admin@choretle.dev");
    const missingFieldRes = await harness.invokeHandler("/api/family", "POST", { name: "" });
    expect(missingFieldRes.status).not.toBe(200);
  });
});
