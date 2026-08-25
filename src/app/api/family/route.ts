import { NextRequest, NextResponse } from "next/server";
import { createFamily } from "@/lib/db/service";
import { slugify } from "@/lib/slugify";
import { error } from "@/lib/logger.server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.name) {
      return NextResponse.json({ error: "Family name is required" }, { status: 400 });
    }

    const family = await createFamily({
      name: body.name,
      slug: slugify(body.name),
      weekStartDay: body.weekStartDay ?? 0,
    });

    if (!family) throw new Error("Failed to create family");
    return NextResponse.json(family);
  } catch (error) {
    error({ err: error }, "Create family failed");
    return NextResponse.json({ error: "Failed to create family" }, { status: 500 });
  }
}
