import { NextRequest, NextResponse } from "next/server";

const WEBSUDO_COOKIE = "webserversudo-session";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  
  // Clear websudo cookie
  response.headers.set(
    "set-cookie",
    `${WEBSUDO_COOKIE}=; path=/; secure=true; httponly=true`,
  );
  
  return response;
}
