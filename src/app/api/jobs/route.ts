import { NextRequest, NextResponse } from "next/server";
import { getJobsByList, createJob, updateJob } from "@/lib/db/service";

export async function GET(request: NextRequest) {
  const listId = request.headers.get("x-list-id") || "";
  const jobs = await getJobsByList(listId);
  return NextResponse.json(jobs);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const job = await createJob(body);
  return NextResponse.json(job);
}

export async function PUT(request: NextRequest) {
  const { id, status } = await request.json();
  const job = await updateJob(id, { status });
  return NextResponse.json(job);
}
