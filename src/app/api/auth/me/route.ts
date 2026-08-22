import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseMiddlewareClient(request);
  
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required" },
      { status: 401 }
    );
  }

  const userId = session.user.id;

  // Fetch user profile from DB
  const requestUrl = new URL(request.url);
  const response = NextResponse.next();
  response.headers.set("x-user-id", userId);
  response.headers.set("x-family-id", session.user.user_metadata?.family_id || "");

  return fetch(`${requestUrl.origin}/api/profile/${userId}`, {
    headers: response.headers,
  }).then((res) => res.json());
}
