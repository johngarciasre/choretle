import { NextRequest, NextResponse } from "next/server";

// Stub — replace with real DB access when Supabase is configured
export async function GET(request: NextRequest) {
  return NextResponse.json({ type: "daily", jobsCompleted: [], jobsInProgress: [], totalPointsEarned: 0 });
}
