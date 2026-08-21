import { NextRequest, NextResponse } from "next/server";
import { getInviteByCode } from "@/lib/db/service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.code) return NextResponse.json({ error: "Invite code is required" }, { status: 400 });

    const invite = await getInviteByCode(body.code);
    if (!invite) {
      return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
    }

    return NextResponse.json({ id: invite.familyId, name: "Family" });
  } catch (error) {
    console.error("Join family failed:", error);
    return NextResponse.json({ error: "Failed to join family" }, { status: 500 });
  }
}
