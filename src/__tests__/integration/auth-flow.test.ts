import { describe, it, expect } from "vitest";
import { TestHarness } from "./harness";

describe("Auth Flow Integration", () => {
  it("POST /api/auth/signin creates dev session cookie", async () => {
    const harness = new TestHarness();
    const res = await harness.signIn("admin@choretle.dev");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.userId).toBe("dev-user-admin-001");
    expect(res.headers["set-cookie"]).toContain("dev-session=");
  });

  it("POST /api/auth/signin with child email sets child role", async () => {
    const harness = new TestHarness();
    const res = await harness.signIn("child@choretle.dev");

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
    await harness.signIn("admin@choretle.dev");

    const res = await harness.invokeHandler("/api/auth/me", "GET");
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe("dev-user-admin-001");
  });

  it("POST /api/auth/signout clears session cookie", async () => {
    const harness = new TestHarness();
    
    // Sign in first
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
    
    // Sign in as admin
    await harness.signIn("admin@choretle.dev");
    expect(harness.getCookieJar().get("dev-session")).toBeTruthy();

    // Sign in as child — should replace the cookie
    const res = await harness.signIn("child@choretle.dev");
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("child");
  });
});
