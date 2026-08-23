import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  console.log("[AUTH_ME] === START ===");
  
  const cookieHeader = request.headers.get("cookie") || "";
  console.log("[AUTH_ME] Cookie header:", cookieHeader ? `${cookieHeader.substring(0, 200)}...` : "EMPTY");
  
  if (!cookieHeader) {
    console.log("[AUTH_ME] No cookies in request!");
    return NextResponse.json({ authenticated: false });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet) {
            request.cookies.set(cookie.name, cookie.value);
          }
        },
      }
    }
  );
  
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    console.log("[AUTH_ME] Session found:", session.user.id);
    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        role: session.user.user_metadata?.role || "child",
        name: session.user.user_metadata?.name || "",
      },
    });
  }

  console.log("[AUTH_ME] No session found");
  return NextResponse.json({ authenticated: false });
}
