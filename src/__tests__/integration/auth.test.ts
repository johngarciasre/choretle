import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb } from "@/db/drizzle";

describe("API Integration — Auth Flow", () => {
  beforeEach(() => {
    resetDb();
  });

  it("POST /api/auth/signin returns auth response for dev user", async () => {
    const harness = new TestHarness();
    const res = await harness.signIn("admin@choretle.dev");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.userId).toMatch(/^dev-user-/);
  });

  it("first user to sign in gets admin role", async () => {
    const harness = new TestHarness();
    resetDb();
    const res = await harness.signIn("admin@choretle.dev");

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
  });

  it("second user to sign in gets child role", async () => {
    const harness = new TestHarness();
    resetDb();
    
    // First sign-in creates admin
    await harness.signIn("first@choretle.dev");
    
    // Second sign-in creates child
    const res = await harness.signIn("second@choretle.dev");
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("child");
  });

  it("GET /api/auth/me without cookie returns 401", async () => {
    const harness = new TestHarness();
    const res = await harness.invokeHandler("/api/auth/me", "GET");

    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me with valid cookie returns user info", async () => {
    const harness = new TestHarness();
    resetDb();
    await harness.signIn("admin@choretle.dev");

    const res = await harness.invokeHandler("/api/auth/me", "GET");
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.user.id).toMatch(/^dev-user-/);
  });

  it("POST /api/auth/signout clears session cookie", async () => {
    const harness = new TestHarness();

    resetDb();
    await harness.signIn("admin@choretle.dev");
    expect(harness.getCookieJar().get("dev-session")).toBeTruthy();

    const res = await harness.signOut();
    expect(res.status).toBe(200);
    expect(harness.getCookieJar().get("dev-session")).toBeNull();

    // Try to access protected route — should now be 401
    const protectedRes = await harness.invokeHandler("/api/auth/me", "GET");
    expect(protectedRes.status).toBe(401);
  });

  it("Multiple sign-ins replace the session cookie", async () => {
    const harness = new TestHarness();
    
    resetDb();
    // First sign-in creates admin
    await harness.signIn("first@choretle.dev");
    expect(harness.getCookieJar().get("dev-session")).toBeTruthy();

    // Second sign-in — should create child user
    const res = await harness.signIn("child@choretle.dev");
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("child");
  });
});
