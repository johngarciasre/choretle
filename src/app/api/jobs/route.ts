import { NextRequest, NextResponse } from "next/server";
import { getJobsByList, createJob, updateJob, deleteJob } from "@/lib/db/service";
import { error } from "@/lib/logger.server";

export async function GET(request: NextRequest) {
  try {
    const listId = request.headers.get("x-list-id") || "";
    if (!listId) return NextResponse.json([]);
    const jobs = await getJobsByList(listId);
    return NextResponse.json(jobs);
  } catch (err) {
    error({ err: err }, "Get jobs failed");
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.slateId) {
      return NextResponse.json({ error: "slateId is required" }, { status: 400 });
    }
    const jobData = {
      list_id: body.slateId,
      name: body.name || "",
      description: body.description,
      points: body.points || 0,
    };
    const job = await createJob(jobData);
    if (!job) throw new Error("Failed to create job");
    return NextResponse.json(job);
  } catch (err) {
    error({ err: err }, "Create job failed");
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
  } catch (err) {
    error({ err: err }, "Update job failed");
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const deleted = await deleteJob(body.id);
    if (!deleted) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, deleted: body.id });
  } catch (err) {
    error({ err: err }, "Delete job failed");
    return NextResponse.json({ error: "Failed to delete job" }, { status: 500 });
  }
}
