/**
 * Integration test harness for Choretle.
 * 
 * Directly invokes Next.js route handlers with mock NextRequest objects,
 * providing cookie jar persistence across request chains. No server needed.
 */

import { NextRequest } from "next/server";

export interface MockResponse {
  status: number;
  body: any;
  headers: Record<string, string>;
}

interface CookieJar {
  cookies: Map<string, string>;
  
  set(name: string, value: string): void;
  get(name: string): string | null;
  clear(): void;
  getAll(): Map<string, string>;
}

export class TestHarness {
  private jar: CookieJar;
  private baseUrl: string;

  constructor(baseUrl = "http://localhost:3000") {
    this.jar = {
      cookies: new Map(),
      set(name, value) {
        this.cookies.set(name, value);
      },
      get(name) {
        return this.cookies.get(name) || null;
      },
      clear() {
        this.cookies.clear();
      },
      getAll() {
        return new Map(this.cookies);
      },
    };
    this.baseUrl = baseUrl;
  }

  /** Returns the cookie jar for inspection */
  getCookieJar(): CookieJar {
    return this.jar;
  }

  /** Clears all cookies (simulates logout) */
  clearCookies(): void {
    this.jar.clear();
  }

  /**
   * Create a mock NextRequest with the given path, method, body, and jar.
   */
  createMockRequest(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" = "GET",
    body?: any
  ): { request: NextRequest; handlerPath: string } {
    const url = `${this.baseUrl}${path}`;
    
    // Build cookie header from jar
    const cookiesStr: string[] = [];
    for (const [name, value] of this.jar.cookies) {
      cookiesStr.push(`${name}=${value}`);
    }

    const headers = new Headers();
    headers.set("cookie", cookiesStr.join("; "));
    
    // Also add any non-cookie headers from the jar (e.g., x-family-id, x-user-id)
    for (const [name, value] of this.jar.cookies) {
      if (name.startsWith("x-")) {
        headers.set(name, value);
      }
    }
    
    if (body && method !== "GET") {
      headers.set("content-type", "application/json");
    }

    const request = new NextRequest(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    return { request, handlerPath: path };
  }

  /**
   * Helper to extract Set-Cookie headers from response and update jar.
   */
  private async extractCookies(response: Response): Promise<void> {
    const setCookie = response.headers.get("set-cookie") || "";
    if (setCookie) {
      // Parse individual cookies (can be comma-separated for multiple)
      const cookies = setCookie.split(/,(?=\s*\w+=)/);
      for (const cookie of cookies) {
        const trimmed = cookie.trim();
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const name = trimmed.substring(0, eqIdx).trim().toLowerCase();
        const rest = trimmed.substring(eqIdx + 1).trim();
        
        // Check if this is a dev-session cookie
        if (name === "dev-session") {
          // Extract value before any semicolon (value can be empty for clearing)
          const semiColonIdx = rest.indexOf(";");
          const value = semiColonIdx !== -1 ? rest.substring(0, semiColonIdx).trim() : rest;
          
          if (value === "") {
            this.jar.cookies.delete("dev-session");
          } else {
            this.jar.set("dev-session", value);
          }
        }
      }
    }
  }

  /**
   * Invoke a route handler directly with mock request.
   */
  async invokeHandler(
    handlerPath: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
    body?: any
  ): Promise<MockResponse> {
    const url = new URL(`${this.baseUrl}${handlerPath}`);
    
    // Build cookie header from jar
    const cookiesStr: string[] = [];
    for (const [name, value] of this.jar.cookies) {
      cookiesStr.push(`${name}=${value}`);
    }

    const headers = new Headers();
    headers.set("cookie", cookiesStr.join("; "));
    
    // Also add any non-cookie headers from the jar (e.g., x-family-id, x-user-id)
    for (const [name, value] of this.jar.cookies) {
      if (name.startsWith("x-")) {
        headers.set(name, value);
      }
    }
    
    if (body && method !== "GET") {
      headers.set("content-type", "application/json");
    }

    // Create NextRequest
    const req = new NextRequest(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Import and invoke the handler using @ alias for vitest resolution
    let handlerModule: any;
    try {
      const relativePath = handlerPath.replace(/^\//, "").replace(/\?.*$/, "").replace(/\//g, "/");
      handlerModule = await import(`@/app/${relativePath}/route`);
    } catch (e) {
      return { status: 404, body: { error: "Handler not found" }, headers: {} };
    }

    // Invoke the appropriate handler method
    let response: Response;
    if (method === "GET") {
      response = await handlerModule.GET(req);
    } else if (method === "POST") {
      response = await handlerModule.POST(req);
    } else if (method === "PUT") {
      response = await handlerModule.PUT(req);
    } else if (method === "DELETE") {
      response = await handlerModule.DELETE(req);
    } else if (method === "PATCH") {
      response = await handlerModule.PATCH?.(req) || handlerModule.PUT?.(req) || new Response("Not found", { status: 404 });
    } else {
      return { status: 405, body: { error: "Method not allowed" }, headers: {} };
    }

    const responseHeaders: Record<string, string> = {};
    for (const [key, value] of response.headers) {
      responseHeaders[key.toLowerCase()] = value;
    }

    let responseBody: any;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    // Extract Set-Cookie headers and update jar
    const setCookieHeaders = response.headers.get("set-cookie");
    if (setCookieHeaders) {
      // Parse individual cookies from the header (can be semicolon or comma separated)
      const cookies = setCookieHeaders.split(/,(?=\s*\w+=)/);
      for (const cookie of cookies) {
        const trimmed = cookie.trim();
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const name = trimmed.substring(0, eqIdx).trim().toLowerCase();
        const rest = trimmed.substring(eqIdx + 1).trim();
        
        // Check if this is a dev-session cookie
        if (name === "dev-session") {
          // Extract value before any semicolon (value can be empty for clearing)
          const semiColonIdx = rest.indexOf(";");
          const value = semiColonIdx !== -1 ? rest.substring(0, semiColonIdx).trim() : rest;
          
          if (value === "") {
            // Cookie is being cleared
            this.jar.cookies.delete("dev-session");
          } else {
            this.jar.set("dev-session", value);
          }
        }
      }
    }

    return {
      status: response.status,
      body: responseBody,
      headers: responseHeaders,
    };
  }

  /**
   * Sign in as a specific user and update the jar.
   */
  async signIn(email: string, password = "test"): Promise<MockResponse> {
    return this.invokeHandler("/api/auth/signin", "POST", { email, password });
  }

  /**
   * Sign out (clear cookies).
   */
  async signOut(): Promise<MockResponse> {
    const response = await this.invokeHandler("/api/auth/signout", "POST");
    this.jar.clear();
    return response;
  }

  /**
   * Create a mock family via the API and return the family ID.
   */
  async createFamily(name: string, slug: string): Promise<string> {
    const res = await this.invokeHandler("/api/family", "POST", {
      name,
      slug,
    });
    if (res.status !== 200) return "";
    return res.body.id || "";
  }

  /**
   * Create a mock user via the API.
   */
  async createUser(email: string, name: string, role = "child", familyId?: string): Promise<string> {
    const res = await this.invokeHandler("/api/users", "POST", {
      email,
      name,
      role,
      ...(familyId && { familyId }),
    });
    if (res.status !== 200) return "";
    return res.body.id || "";
  }

  /**
   * Create a mock slate via the API.
   */
  async createSlate(name: string, familyId: string, frequency = "weekly", interval = 1): Promise<string> {
    const res = await this.invokeHandler("/api/slates", "POST", {
      name,
      familyId,
      frequency,
      interval,
    });
    if (res.status !== 200) return "";
    return res.body.id || "";
  }

  /**
   * Set the family ID cookie (simulates middleware x-family-id header).
   */
  setFamilyId(familyId: string): void {
    this.jar.cookies.set("x-family-id", familyId);
  }

  /**
   * Clear the family ID cookie.
   */
  clearFamilyId(): void {
    this.jar.cookies.delete("x-family-id");
  }

  /**
   * Get the current family ID from cookies, if set.
   */
  getFamilyId(): string | null {
    return this.jar.cookies.get("x-family-id") || null;
  }
}