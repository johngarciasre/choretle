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

  it("first user to sign up gets parent role", async () => {
    const harness = new TestHarness();
    const res = await harness.signIn("admin@choretle.dev");

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("parent");
  });

  it("signing up without an invite makes you a parent of a new family", async () => {
    const harness = new TestHarness();
    // Reset DB for clean state
    resetDb();

    const res = await harness.invokeHandler("/api/auth/signup", "POST", {
      email: "first@choretle.dev",
      password: "password123",
      name: "First User",
    });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("parent");
    expect(res.body.familyId).toBeTruthy();

    const me = await harness.invokeHandler("/api/auth/me", "GET");
    expect(me.body.user.role).toBe("parent");
    expect(me.body.familyId).toBe(res.body.familyId);
  });

  it("GET /api/auth/me without a cookie reports unauthenticated", async () => {
    const harness = new TestHarness();
    const res = await harness.invokeHandler("/api/auth/me", "GET");

    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(false);
  });

  it("GET /api/auth/me with valid cookie returns user info", async () => {
    const harness = new TestHarness();
    // Reset DB for clean state to ensure first user is parent
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

    // Try to access protected route — should return authenticated: false (not 401, as /me is a public status check)
    const protectedRes = await harness.invokeHandler("/api/auth/me", "GET");
    expect(protectedRes.status).toBe(200);
    expect(protectedRes.body.authenticated).toBe(false);
  });

  it("each new account gets its own family instead of joining the first one", async () => {
    const harness = new TestHarness();

    resetDb();
    const first = await harness.signIn("first@choretle.dev");
    expect(first.body.role).toBe("parent");
    expect(harness.getCookieJar().get("dev-session")).toBeTruthy();

    const second = await harness.signIn("second@choretle.dev");
    expect(second.status).toBe(200);
    expect(second.body.role).toBe("parent");
    expect(second.body.familyId).toBeTruthy();
    expect(second.body.familyId).not.toBe(first.body.familyId);
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
