import { NextRequest, NextResponse } from "next/server";
import { createFamily } from "@/lib/db/service";

export async function POST(request: NextRequest) {
  const { name, weekStartDay = 0 } = await request.json();
  const family = await createFamily({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50), weekStartDay });
  if (!family) throw new Error("Failed to create family");
  return NextResponse.json(family);
}
