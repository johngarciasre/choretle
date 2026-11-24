import { NextRequest, NextResponse } from "next/server";
import { autoGenerateJobs } from "@/lib/slateAutoGen";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (auth.role !== "parent") {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const targetDate = body?.date ? new Date(body.date) : new Date();
    if (isNaN(targetDate.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    // The family always comes from the session — never from the request body.
    const jobs = await autoGenerateJobs(auth.familyId, targetDate);

    return NextResponse.json({ jobs, count: jobs.length });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Auto-generation failed");
    return NextResponse.json(
      { error: "Failed to generate jobs" },
      { status: 500 },
    );
  }
}
