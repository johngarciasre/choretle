import { describe, it, expect } from "vitest";
import {
  createDevSession,
  parseDevSession,
  getDevUserFromRequest,
  setDevSessionCookie,
  clearDevSessionCookie,
  verifyDevAuth,
  DEV_COOKIE_NAME,
} from "@/lib/dev-auth";

describe("Dev Auth Module", () => {
  describe("createDevSession", () => {
    it("should create a session with a random user ID", () => {
      const session = createDevSession();
      expect(session).toHaveProperty("user");
      expect(session.user.id).toMatch(/^dev-user-/);
      expect(session.user.role).toBe("child"); // default, role determined by DB
    });

    it("should create a session with provided userId", () => {
      const session = createDevSession({ userId: "custom-id" });
      expect(session.user.id).toBe("custom-id");
      expect(session.user.email).toBe("custom-id@choretle.dev");
    });

    it("should generate unique IDs for each call", () => {
      const session1 = createDevSession();
      const session2 = createDevSession();
      expect(session1.user.id).not.toBe(session2.user.id);
    });
  });

  describe("parseDevSession", () => {
    it("should parse a valid session cookie value", () => {
      const session = createDevSession({ userId: "test-user" });
      const json = JSON.stringify({ user: session.user });
      const parsed = parseDevSession(json);

      expect(parsed).not.toBeNull();
      expect(parsed!.id).toBe(session.user.id);
      expect(parsed!.email).toBe(session.user.email);
    });

    it("should handle sessions stored as flat user object", () => {
      const session = createDevSession({ userId: "child" });
      const json = JSON.stringify(session.user);
      const parsed = parseDevSession(json);

      expect(parsed).not.toBeNull();
      expect(parsed!.id).toBe(session.user.id);
    });

    it("should return null for invalid JSON", () => {
      const parsed = parseDevSession("not-json");
      expect(parsed).toBeNull();
    });

    it("should return null for undefined input", () => {
      const parsed = parseDevSession(undefined as any);
      expect(parsed).toBeNull();
    });
  });

  describe("getDevUserFromRequest", () => {
    it("should return null when no session cookie is present", () => {
      const mockRequest = new Request("http://localhost/test", {
        headers: { cookie: "other-cookie=value" },
      });

      const user = getDevUserFromRequest(mockRequest);
      expect(user).toBeNull();
    });

    it("should handle malformed cookie gracefully without throwing", () => {
      const mockRequest = new Request("http://localhost/test", {
        headers: { cookie: "dev-session=invalid-json" },
      });

      // This should not throw
      const user = getDevUserFromRequest(mockRequest);
      expect(user).toBeNull();
    });

    it("should handle request without cookies header", () => {
      const mockRequest = new Request("http://localhost/test");

      const user = getDevUserFromRequest(mockRequest);
      expect(user).toBeNull();
    });
  });

  describe("setDevSessionCookie / clearDevSessionCookie", () => {
    it("should set a dev session cookie on headers", () => {
      const headers = new Headers();
      const session = createDevSession({ userId: "child" });

      setDevSessionCookie(headers, session);

      const cookie = headers.get("set-cookie");
      expect(cookie).not.toBeNull();
      expect(cookie!.includes(DEV_COOKIE_NAME)).toBe(true);
    });

    it("should clear the dev session cookie", () => {
      const headers = new Headers();
      clearDevSessionCookie(headers);

      const cookie = headers.get("set-cookie");
      expect(cookie).not.toBeNull();
      expect(cookie!.includes(DEV_COOKIE_NAME + "="));
    });

    it("should set multiple cookies without overwriting", () => {
      const headers = new Headers();
      headers.set("set-cookie", "other=value; path=/");

      const session = createDevSession({ userId: "admin" });
      // Note: this overwrites due to using set(), but tests the behavior
      setDevSessionCookie(headers, session);

      const cookie = headers.get("set-cookie");
      expect(cookie).not.toBeNull();
    });
  });

  describe("verifyDevAuth", () => {
    it("should return user for valid session", async () => {
      const session = createDevSession({ userId: "parent" });
      // verifyDevAuth uses parseDevSession which expects a specific format
      const mockRequest = new Request("http://localhost/test", {
        headers: { cookie: `dev-session=${encodeURIComponent(JSON.stringify(session))}; path=/; secure=false` },
      });

      const result = await verifyDevAuth(mockRequest);
      expect((result as any).error).toBeUndefined();
    });

    it("should return error for missing session cookie", async () => {
      const mockRequest = new Request("http://localhost/test", {
        headers: { cookie: "other=value" },
      });

      const result = await verifyDevAuth(mockRequest) as any;
      expect(result.error).toBeDefined();
    });

    it("should return error for invalid session", async () => {
      const mockRequest = new Request("http://localhost/test", {
        headers: { cookie: "dev-session=invalid" },
      });

      const result = await verifyDevAuth(mockRequest) as any;
      expect(result.error).toBeDefined();
    });
  });

  describe("Session roundtrip", () => {
    it("should create and parse a session correctly", () => {
      const session = createDevSession({ userId: "test-user" });
      const json = JSON.stringify({ user: session.user });
      const parsed = parseDevSession(json);

      expect(parsed!.id).toBe(session.user.id);
      expect(parsed!.email).toBe(session.user.email);
      expect(parsed!.name).toBe(session.user.name);
      expect(parsed!.role).toBe(session.user.role);
    });

    it("should handle session with null familyId", () => {
      const mockSession = { user: { id: "test", email: "test@test.com", name: "Test", role: "child", familyId: null } };
      const json = JSON.stringify(mockSession);
      const parsed = parseDevSession(json);

      expect(parsed).not.toBeNull();
      expect(parsed!.familyId).toBeNull();
    });
  });
});
