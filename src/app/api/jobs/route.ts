import { NextRequest, NextResponse } from "next/server";
import { getJobsByList, createJob, updateJob } from "@/lib/db/service";
import { error } from "@/lib/logger.server";

export async function GET(request: NextRequest) {
  try {
    const listId = request.headers.get("x-list-id") || "";
    if (!listId) return NextResponse.json([]);
    const jobs = await getJobsByList(listId);
    return NextResponse.json(jobs);
  } catch (error) {
    error({ err: error }, "Get jobs failed");
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.familyId || !body?.slateId) {
      return NextResponse.json({ error: "familyId and slateId are required" }, { status: 400 });
    }
    const job = await createJob(body);
    if (!job) throw new Error("Failed to create job");
    return NextResponse.json(job);
  } catch (error) {
    error({ err: error }, "Create job failed");
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.id || !body?.status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    }
    const job = await updateJob(body.id, { status: body.status });
    if (!job) throw new Error("Failed to update job");
    return NextResponse.json(job);
  } catch (error) {
    error({ err: error }, "Update job failed");
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}
