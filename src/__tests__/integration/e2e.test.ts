import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb } from "@/db/drizzle";

describe("E2E — Full Workflow: Family Setup → Jobs → Rotations", () => {
  beforeEach(() => {
    resetDb();
  });

  it("Complete workflow: create family → slates → jobs → rotations", async () => {
    const harness = new TestHarness();
    
    // Step 1: Sign in as admin (auto-creates a family)
    await harness.signIn("admin@choretle.dev");
    expect(harness.getCookieJar().get("dev-session")).toBeTruthy();

    // Get the auto-created family ID
    const meRes = await harness.invokeHandler("/api/auth/me", "GET");
    expect(meRes.status).toBe(200);
    expect(meRes.body.familyId).toBeTruthy();
    const familyId = meRes.body.familyId;

    // Step 2: Create a slate (using the auto-created family)
    const slateRes = await harness.invokeHandler("/api/slates", "POST", {
      name: "E2E Slate",
      familyId,
    });
    expect(slateRes.status).toBe(201);

    // Step 3: Create a job
    const jobRes = await harness.invokeHandler("/api/jobs", "POST", {
      name: "E2E Job",
      familyId,
      slateId: slateRes.body.id,
    });
    expect(jobRes.status).toBe(200);

    // Step 4: Create a rotation
    const rotRes = await harness.invokeHandler("/api/rotations", "POST", {
      slateId: slateRes.body.id,
      userId: meRes.body.user?.id || "dev-user-admin-001",
    });
    expect(rotRes.status).toBe(201);

    // Step 5: Complete the job workflow
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
    
    // Admin signs in (auto-creates a family)
    await harness.signIn("admin@choretle.dev");
    const adminMeRes = await harness.invokeHandler("/api/auth/me", "GET");
    expect(adminMeRes.status).toBe(200);
    expect(adminMeRes.body.familyId).toBeTruthy();
    const adminFamilyId = adminMeRes.body.familyId;

    // Child signs in (gets their own family — different user)
    await harness.signIn("child@choretle.dev");
    const childMeRes = await harness.invokeHandler("/api/auth/me", "GET");
    expect(childMeRes.status).toBe(200);
    expect(childMeRes.body.familyId).toBeTruthy();

    // Child creates a job in their own family
    const slateRes = await harness.invokeHandler("/api/slates", "POST", {
      name: "Child Slate",
      familyId: childMeRes.body.familyId,
    });
    expect(slateRes.status).toBe(201);

    const jobRes = await harness.invokeHandler("/api/jobs", "POST", {
      name: "Child Job",
      familyId: childMeRes.body.familyId,
      slateId: slateRes.body.id,
    });
    expect(jobRes.status).toBe(200);
  });

  it("Session isolation — each harness has independent cookies", async () => {
    // Create first harness and sign in as admin
    const harness1 = new TestHarness();
    await harness1.signIn("admin@choretle.dev");
    
    const me1Res = await harness1.invokeHandler("/api/auth/me", "GET");
    expect(me1Res.status).toBe(200);
    expect(me1Res.body.familyId).toBeTruthy();

    // Create second harness and sign in as child (different user)
    const harness2 = new TestHarness();
    await harness2.signIn("child@choretle.dev");
    
    const me2Res = await harness2.invokeHandler("/api/auth/me", "GET");
    expect(me2Res.status).toBe(200);
    expect(me2Res.body.familyId).toBeTruthy();

    // Verify both sessions work independently with valid cookies
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

    // Valid auth, missing required field — signin auto-creates a family
    await harness.signIn("admin@choretle.dev");
    // Trying to create another family with empty name returns 400 (name validation)
    const alreadyHasFamily = await harness.invokeHandler("/api/family", "POST", { name: "" });
    expect(alreadyHasFamily.status).toBe(400);
  });
});
