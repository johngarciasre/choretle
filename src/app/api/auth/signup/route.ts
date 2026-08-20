import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { email, password, name } = await request.json();

  // For now, create a demo user with a UUID stored in the response header
  // Replace this with real Supabase auth when ready
  const userId = crypto.randomUUID();

  return new NextResponse("OK", {
    headers: { "x-user-id": userId },
  });
}
