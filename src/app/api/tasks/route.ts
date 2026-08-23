import { NextRequest, NextResponse } from "next/server";
import { getTasksByFamily, createTask, updateTask, deleteTask } from "@/lib/db/service";

export async function GET(request: NextRequest) {
  try {
    const familyId = request.headers.get("x-family-id") || "";
    if (!familyId) return NextResponse.json([]);

    const searchParams = request.nextUrl.searchParams;
    const tagIds = searchParams.get("tagIds");

    let tasks = await getTasksByFamily(familyId);

    // Filter by tags if provided
    if (tagIds) {
      const tagIdArray = JSON.parse(tagIds);
      tasks = tasks.filter((task: any) => task.tagIds && tagIdArray.some((id: string) => task.tagIds.includes(id)));
    }

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Get tasks failed:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.familyId || !body?.title) {
      return NextResponse.json({ error: "familyId and title are required" }, { status: 400 });
    }
    const task = await createTask(body);
    if (!task) throw new Error("Failed to create task");
    return NextResponse.json(task);
  } catch (error) {
    console.error("Create task failed:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const task = await updateTask(body.id, body);
    if (!task) throw new Error("Failed to update task");
    return NextResponse.json(task);
  } catch (error) {
    console.error("Update task failed:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await deleteTask(body.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete task failed:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
