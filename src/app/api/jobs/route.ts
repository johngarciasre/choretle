import { NextRequest, NextResponse } from "next/server";

// Stub — replace with real DB access when Supabase is configured
export async function GET(request: NextRequest) {
  return NextResponse.json([]);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return NextResponse.json({ id: crypto.randomUUID(), ...body });
}

export async function PUT(request: NextRequest) {
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  return NextResponse.json({ success: true });
}
