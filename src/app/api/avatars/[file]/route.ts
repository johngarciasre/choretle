import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { verifyAuth } from "@/lib/auth";
import { error } from "@/lib/logger.server";

/**
 * Profile pictures are household data, so they live in private/avatars (outside the
 * web root) and are only served to signed-in members. Anonymous visitors and
 * crawlers get nothing.
 */
const AVATAR_DIR = path.join(process.cwd(), "private", "avatars");
const FILE_PATTERN = /^[a-z0-9-]+\.(jpg|png|webp)$/;
const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const auth = await verifyAuth(request);
  if (!auth) return new NextResponse(null, { status: 401, headers: { "Cache-Control": "no-store" } });

  const file = (await params).file || "";
  const match = FILE_PATTERN.exec(file);
  if (!match) return new NextResponse(null, { status: 404 });

  try {
    const bytes = await readFile(path.join(AVATAR_DIR, file));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": CONTENT_TYPES[match[1]],
        // Browser-only cache: no shared proxy may keep a copy.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    error({ err: String(err), file }, "Avatar read failed");
    return new NextResponse(null, { status: 404 });
  }
}
