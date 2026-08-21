import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  // Skip auth check for auth routes and static assets
  if (request.url.includes("/auth/") || request.url.includes("/_next/")) {
    return response;
  }
  
  // Get token from cookie
  let userId: string | null = null;
  
  const token = request.cookies.get("auth-token")?.value;
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        // Decode JWT payload (base64url encoded)
        const payload = Buffer.from(parts[1], "base64url").toString();
        const decoded = JSON.parse(payload);
        
        // Check expiration
        if (decoded.exp && decoded.exp > Date.now() / 1000) {
          userId = decoded.userId;
        }
      }
    } catch {
      // Token invalid, continue without auth
    }
  }
  
  if (userId) {
    response.headers.set("x-user-id", userId);
    return response;
  }

  // No valid token - redirect to sign-in for page requests
  // Return 401 for API requests
  if (request.url.includes("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/auth/signin", request.url));
}
