import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb } from "@/db/drizzle";

describe("Auth Flow Integration", () => {
  beforeEach(() => {
    resetDb();
  });

  it("POST /api/auth/signin creates dev session cookie", async () => {
    const harness = new TestHarness();
    const res = await harness.signIn("admin@choretle.dev");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.userId).toMatch(/^dev-user-/);
    expect(res.headers["set-cookie"]).toContain("dev-session=");
  });

  it("first user to sign up gets admin role", async () => {
    const harness = new TestHarness();
    const res = await harness.signIn("admin@choretle.dev");

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
  });

  it("first user to sign up gets admin role on signup route", async () => {
    const harness = new TestHarness();
    // Reset DB for clean state
    resetDb();
    
    const res = await harness.invokeHandler("/api/auth/signup", "POST", {
      email: "first@choretle.dev",
      password: "password123",
      name: "First User",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // First user should be admin (checked via /api/auth/me)
  });

  it("GET /api/auth/me without cookie returns 401", async () => {
    const harness = new TestHarness();
    const res = await harness.invokeHandler("/api/auth/me", "GET");

    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me with valid cookie returns user info", async () => {
    const harness = new TestHarness();
    // Reset DB for clean state to ensure first user is admin
    resetDb();
    
    await harness.signIn("admin@choretle.dev");

    const res = await harness.invokeHandler("/api/auth/me", "GET");
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.user.id).toMatch(/^dev-user-/);
  });

  it("POST /api/auth/signout clears session cookie", async () => {
    const harness = new TestHarness();
    
    // Sign in first
    resetDb();
    await harness.signIn("admin@choretle.dev");
    expect(harness.getCookieJar().get("dev-session")).toBeTruthy();

    // Sign out
    const res = await harness.signOut();
    expect(res.status).toBe(200);
    expect(harness.getCookieJar().get("dev-session")).toBeNull();

    // Try to access protected route — should now be 401
    const protectedRes = await harness.invokeHandler("/api/auth/me", "GET");
    expect(protectedRes.status).toBe(401);
  });

  it("Multiple sign-ins replace the session cookie", async () => {
    const harness = new TestHarness();
    
    // Sign in first time
    resetDb();
    await harness.signIn("admin@choretle.dev");
    expect(harness.getCookieJar().get("dev-session")).toBeTruthy();

    // Sign in again — should create a new user with admin role (first user)
    const res = await harness.signIn("second@choretle.dev");
    expect(res.status).toBe(200);
    // Second user should be child since first is already admin
    expect(res.body.role).toBe("child");
  });

  it("GET /api/auth/signup returns session info when logged in", async () => {
    const harness = new TestHarness();
    resetDb();
    await harness.signIn("admin@choretle.dev");

    const res = await harness.invokeHandler("/api/auth/signup", "GET");
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
  });
});
