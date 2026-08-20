import { NextRequest, NextResponse } from "next/server";
import { getInviteByCode } from "@/lib/db/service";

export async function POST(request: NextRequest) {
  const { code } = await request.json();
  const invite = await getInviteByCode(code);
  if (!invite) return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
  return NextResponse.json({ id: invite.familyId, name: "Family" });
}
