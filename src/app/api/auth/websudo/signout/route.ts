import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";

const WEBSUDO_COOKIE = "webserversudo-session";

async function POST(_request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  
  // Clear websudo cookie
  response.headers.set(
    "set-cookie",
    `${WEBSUDO_COOKIE}=; path=/; secure=true; httponly=true; sameSite=lax`,
  );
  
  return response;
}

const POST_impl = withTenant(POST);
export { POST_impl as POST };
