import { NextRequest, NextResponse } from "next/server";
import { getTasksByFamily, createTask, updateTask, deleteTask } from "@/lib/db/service";

export async function GET(request: NextRequest) {
  const familyId = request.headers.get("x-family-id") || "";
  const tasks = await getTasksByFamily(familyId);
  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const task = await createTask(body);
  if (!task) throw new Error("Failed to create task");
  return NextResponse.json(task);
}

export async function PUT(request: NextRequest) {
  const { id, ...updates } = await request.json();
  const task = await updateTask(id, updates);
  return NextResponse.json(task);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  await deleteTask(id);
  return NextResponse.json({ success: true });
}
