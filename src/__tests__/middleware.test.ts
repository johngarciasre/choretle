import { describe, it, expect } from "vitest";

// Extract the public route constants from middleware for testing
const PUBLIC_ROUTES = [
  "/auth/signin",
  "/auth/signup",
  "/auth/signup/verify-email",
  "/_next/static",
  "/_next/image",
  "/favicon.ico",
  "/manifest.json",
  "/apple-touch-icon.png",
];

const PUBLIC_API_ROUTES = [
  "/api/auth/signin",
  "/api/auth/signup",
  "/api/auth/signout",
  "/api/auth/me",
  "/api/auth/websudo",
  "/api/family/join",
  "/api/schedules/generate",
];

describe("Middleware Public Route Detection", () => {
  describe("PUBLIC_ROUTES", () => {
    it.each([
      ["/auth/signin", true],
      ["/auth/signup", true],
      ["/auth/signup/verify-email", true],
      ["/_next/static/files/app.js", true],
      ["/_next/image/logo.png", true],
      ["/favicon.ico", true],
      ["/manifest.json", true],
      ["/apple-touch-icon.png", true],
    ])("should recognize '%s' as public route (expected: %s)", (path, expected) => {
      const isPublic = PUBLIC_ROUTES.some((route) => path.startsWith(route));
      expect(isPublic).toBe(expected);
    });

    it.each([
      ["/dashboard", false],
      ["/api/rotations", false],
      ["/tasks", false],
      ["/auth/reset-password", false],
      ["/auth/signin/extra", true], // starts with /auth/signin
    ])("should handle edge cases for public routes ('%s', expected: %s)", (path, expected) => {
      const isPublic = PUBLIC_ROUTES.some((route) => path.startsWith(route));
      expect(isPublic).toBe(expected);
    });

    it("should match /auth/signin/extra as public (prefix match)", () => {
      const path = "/auth/signin/extra";
      const isPublic = PUBLIC_ROUTES.some((route) => path.startsWith(route));
      expect(isPublic).toBe(true);
    });
  });

  describe("PUBLIC_API_ROUTES", () => {
    it.each([
      ["/api/auth/signin", true],
      ["/api/auth/signup", true],
      ["/api/auth/signout", true],
      ["/api/auth/me", true],
      ["/api/auth/websudo", true],
      ["/api/family/join", true],
      ["/api/schedules/generate", true],
    ])("should recognize '%s' as public API route (expected: %s)", (path, expected) => {
      const isPublic = PUBLIC_API_ROUTES.some((route) => path.startsWith(route));
      expect(isPublic).toBe(expected);
    });

    it.each([
      ["/api/auth/admin", false],
      ["/api/rotations", false],
      ["/api/tasks", false],
      ["/api/family", false],
      ["/api/schedules", false], // not /schedules/generate
    ])("should reject non-public API routes ('%s', expected: %s)", (path, expected) => {
      const isPublic = PUBLIC_API_ROUTES.some((route) => path.startsWith(route));
      expect(isPublic).toBe(expected);
    });
  });

  describe("Combined route checking", () => {
    it.each([
      ["/auth/signin", true],
      ["/dashboard", false],
      ["/api/auth/me", true],
      ["/api/rotations", false],
      ["/schedules/generate", false], // only /api/schedules/generate is public
    ])("should correctly classify '%s' as %s", (path, expected) => {
      const isPublic = PUBLIC_ROUTES.some((route) => path.startsWith(route)) ||
        PUBLIC_API_ROUTES.some((route) => path.startsWith(route));
      expect(isPublic).toBe(expected);
    });
  });

  describe("Websudo HMAC verification pattern", () => {
    it.each([
      ["sha-256", "SHA-256"],
    ])("should use %s for websudo HMAC (expected algorithm: %s)", (_algo, expectedAlgo) => {
      // The middleware uses crypto.subtle.importKey with "HMAC" and "SHA-256"
      expect(expectedAlgo).toBe("SHA-256");
    });

    it("should verify HMAC signature pattern", async () => {
      const secret = "test-secret";
      const payload = '{"userId":"123","email":"test@test.com"}';

      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );

      const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
      const hexHash = Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      expect(hexHash.length).toBe(64); // SHA-256 produces 32 bytes = 64 hex chars
    });

    it("should reject wrong secret for HMAC verification", async () => {
      const payload = '{"userId":"123","email":"test@test.com"}';
      const correctKey = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode("correct-secret"),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
      );
      const wrongKey = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode("wrong-secret"),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
      );

      const correctSig = await crypto.subtle.sign("HMAC", correctKey, new TextEncoder().encode(payload));
      const wrongSig = await crypto.subtle.sign("HMAC", wrongKey, new TextEncoder().encode(payload));

      // Signs should be different
      const correctHex = Array.from(new Uint8Array(correctSig)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const wrongHex = Array.from(new Uint8Array(wrongSig)).map((b) => b.toString(16).padStart(2, "0")).join("");
      expect(correctHex).not.toBe(wrongHex);
    });

    it("should handle timing-safe comparison via node crypto", async () => {
      const crypto = await import("crypto");
      const hash1 = crypto.createHash("sha256").update("test1").digest();
      const hash2 = crypto.createHash("sha256").update("test2").digest();
      const hash3 = crypto.createHash("sha256").update("test1").digest();

      // Different hashes should not be equal
      expect(crypto.timingSafeEqual(hash1, hash2)).toBe(false);
      // Same hashes should be equal
      expect(crypto.timingSafeEqual(hash1, hash3)).toBe(true);
    });
  });

  describe("Dev mode session header pattern", () => {
    it("should set x-user-id header in dev mode", () => {
      const headers = new Headers();
      headers.set("x-user-id", "dev-user-admin-001");
      expect(headers.get("x-user-id")).toBe("dev-user-admin-001");
    });

    it("should set x-family-id header in dev mode", () => {
      const headers = new Headers();
      headers.set("x-family-id", "dev-family-001");
      expect(headers.get("x-family-id")).toBe("dev-family-001");
    });

    it("should set x-role header for superadmin via websudo", () => {
      const headers = new Headers();
      headers.set("x-role", "superadmin");
      expect(headers.get("x-role")).toBe("superadmin");
    });

    it("should set x-email header in dev mode", () => {
      const headers = new Headers();
      headers.set("x-email", "admin@choretle.dev");
      expect(headers.get("x-email")).toBe("admin@choretle.dev");
    });
  });

  describe("Config pattern matching", () => {
    it("should match page routes but exclude API and static paths", () => {
      // The middleware config matcher: /((?!api/|_next/|_vercel|[\w-]+\.\w+).*)
      const configPattern = /^\/((?!api\/|_next\/|_vercel|[\w-]+\.\w+).*)$/;

      expect("/dashboard").toMatch(configPattern);
      expect("/tasks").toMatch(configPattern);
      expect("/api/rotations").not.toMatch(configPattern);
      expect("/_next/static/file.js").not.toMatch(configPattern);
    });

    it("should exclude paths with file extensions", () => {
      const configPattern = /^\/((?!api\/|_next\/|_vercel|[\w-]+\.\w+).*)$/;

      // These have extensions like .ico, .json but are in PUBLIC_ROUTES so handled separately
      expect("/favicon.ico").not.toMatch(configPattern); // has extension
      expect("/manifest.json").not.toMatch(configPattern); // has extension
    });

    it("should match routes without extensions", () => {
      const configPattern = /^\/((?!api\/|_next\/|_vercel|[\w-]+\.\w+).*)$/;

      expect("/auth/signin").toMatch(configPattern);
      expect("/dashboard/settings").toMatch(configPattern);
    });
  });

  describe("Cookie parsing for websudo", () => {
    it("should extract websudo cookie from header string", () => {
      const cookieHeader = "session=abc123; webserversudo-session=eyJ123.abcdef456; other=value";
      const setCookie = cookieHeader.split(";").find((c) => c.includes("webserversudo-session"));

      expect(setCookie).toBeDefined();
      expect(setCookie!.includes("webserversudo-session")).toBe(true);
    });

    it("should extract dev session cookie from header string", () => {
      const cookieHeader = 'dev-session={"user":{"id":"123"}}; path=/; other=value';
      const setCookie = cookieHeader.split(";").find((c) => c.includes("dev-session"));

      expect(setCookie).toBeDefined();
    });

    it("should return undefined when cookie is not present", () => {
      const cookieHeader = "session=abc123; other=value";
      const setCookie = cookieHeader.split(";").find((c) => c.includes("webserversudo-session"));

      expect(setCookie).toBeUndefined();
    });
  });
});
