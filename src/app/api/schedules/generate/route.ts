import { NextRequest, NextResponse } from "next/server";
import { autoGenerateJobs } from "@/lib/slateAutoGen";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const familyId = body.familyId;
    const targetDate = body.date ? new Date(body.date) : new Date();

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required" }, { status: 400 });
    }

    const jobs = await autoGenerateJobs(familyId, targetDate);

    return NextResponse.json({ jobs, count: jobs.length });
  } catch (error) {
    console.error("Auto-generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate jobs" },
      { status: 500 },
    );
  }
}
