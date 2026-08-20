import { NextRequest, NextResponse } from "next/server";

// Stub — replace with real DB access when Supabase is configured
export async function POST(request: NextRequest) {
  const { name, weekStartDay = 0 } = await request.json();
  return NextResponse.json({ id: crypto.randomUUID(), name });
}
