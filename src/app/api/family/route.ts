import { NextRequest, NextResponse } from "next/server";
import { createFamily } from "@/lib/db/service";
import { slugify } from "@/lib/slugify";

export async function POST(request: NextRequest) {
  const { name, weekStartDay = 0 } = await request.json();
  const family = await createFamily({ name, slug: slugify(name), weekStartDay });
  if (!family) throw new Error("Failed to create family");
  return NextResponse.json(family);
}
