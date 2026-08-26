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
    };
    this.jar = {
      cookies: new Map(),
      set(this: CookieJar, name: string, value: string) {
        this.cookies.set(name, value);
      },
      get(this: CookieJar, name: string): string | null {
        return this.cookies.get(name) || null;
      },
      clear(this: CookieJar) {
        this.cookies.clear();
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
      // Handle multiple Set-Cookie headers
      const parts = setCookie.split(";");
      if (parts.length >= 2) {
        const name = parts[0].split("=")[0].trim();
        const value = parts.slice(1).join(";").trim();
        
        // For dev-session, we need to store the full encoded value
        const cookieMatch = setCookie.match(/dev-session=([^;]+)/);
        if (cookieMatch) {
          this.jar.set("dev-session", cookieMatch[1]);
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
    
    if (body && method !== "GET") {
      headers.set("content-type", "application/json");
    }

    // Create NextRequest
    const req = new NextRequest(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Import and invoke the handler
    let handlerModule: any;
    try {
      handlerModule = await import(`./${handlerPath.replace(/^\//, "").replace(/\//g, "/")}/route`);
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
      const cookies = setCookieHeaders.split(";");
      for (const cookie of cookies) {
        const match = cookie.match(/dev-session=([^;]+)/);
        if (match) {
          this.jar.set("dev-session", match[1]);
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
}
