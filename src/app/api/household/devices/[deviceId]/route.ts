import { NextRequest, NextResponse } from "next/server";
import { canAuthor, verifyAuth } from "@/lib/auth";
import { error } from "@/lib/logger.server";
import { revokeSession } from "@/lib/session";

/** Parent only: revoke one device. A foreign id is a 404, never a 403. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!canAuthor(auth)) return NextResponse.json({ error: "Parent access required" }, { status: 403 });

    const revoked = await revokeSession((await params).deviceId, auth.householdId);
    if (revoked === 0) return NextResponse.json({ error: "Device not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Device DELETE failed");
    return NextResponse.json({ error: "Failed to revoke the device" }, { status: 500 });
  }
}
