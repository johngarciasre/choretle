import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const userId = request.headers.get("x-user-id") || "";

  // If user is not authenticated, redirect to sign-in
  if (!userId && !request.url.includes("/auth/")) {
    return NextResponse.redirect("/auth/signin");
  }

  // Pass the user ID to downstream handlers
  response.headers.set("x-user-id", userId);
  return response;
}
