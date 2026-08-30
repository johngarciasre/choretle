import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { createDevSession, DEV_COOKIE_NAME, parseDevSession } from "@/lib/dev-auth";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function GET(request: NextRequest) {
  try {
    if (process.env.AUTH_MODE === "dev") {
      const cookieHeader = request.headers.get("cookie") || "";
      const setCookie = cookieHeader.split(";").find((c: string) => c.includes(DEV_COOKIE_NAME));
      if (!setCookie) return NextResponse.json({ authenticated: false });
      const value = setCookie.replace(`${DEV_COOKIE_NAME}=`, "").trim();
      const user = parseDevSession(value);
      if (user) {
        const rawDb = getRawDb();
        if (rawDb) {
          const dbUser = rawDb.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as any;
          return NextResponse.json({
            authenticated: true,
            user: { id: user.id, email: user.email, name: user.name || "", role: user.role || "child" },
            familyId: dbUser?.family_id || null,
            familyName: null,
          });
        }
        return NextResponse.json({ authenticated: true, user: { id: user.id, email: user.email, name: user.name || "", role: user.role || "child" }, familyId: null, familyName: null });
      }
      return NextResponse.json({ authenticated: false });
    }

    if (!hasSupabaseConfig()) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = await getSupabaseMiddlewareClient(request);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      return NextResponse.json({
        authenticated: true,
        user: { id: session.user.id, email: session.user.email,
          name: session.user.user_metadata?.name || "", role: session.user.user_metadata?.role || "child" },
        familyId: null,
        familyName: null,
      });
    }
    return NextResponse.json({ authenticated: false });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Auth/me GET failed");
    return NextResponse.json({ error: "Failed to get auth status" }, { status: 500 });
  }
}
