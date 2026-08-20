import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // Mock jobs — replace with real DB query when Supabase is configured
  return NextResponse.json({ jobs: [], leaderboard: [] });
}
