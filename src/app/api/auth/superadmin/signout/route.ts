import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";

async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const cookieHeader = request.headers.get("cookie") || "";
  const setCookie = cookieHeader.split(";").find((c) => c.includes("superadmin-session"));

  if (!setCookie) {
    return response;
  }

  // Clear superadmin session
  response.headers.set(
    "set-cookie",
    "superadmin-session=; path=/; secure=true; httpOnly=true; sameSite=lax",
  );
  return response;
}

const POST_impl = withTenant(POST);
export { POST_impl as POST };
