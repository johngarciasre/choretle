import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { DEV_COOKIE_NAME, setDevSessionCookie, verifyDevSession } from "@/lib/dev-auth";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { clientKey, clearAttempts, tooManyAttempts } from "@/lib/rate-limit";

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function POST(request: NextRequest) {
  try {
    const attemptKey = clientKey(request, "signin");
    if (tooManyAttempts(attemptKey)) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const body = await request.json();
    const { email, password } = body;

    if (process.env.AUTH_MODE === "dev") {
      const rawDb = getRawDb();
      if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

      const userRow = rawDb.prepare(`SELECT * FROM users WHERE email = ?`).get(email?.toLowerCase()) as any;
      if (!userRow) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

      clearAttempts(attemptKey);
      const response = NextResponse.json({
        ok: true,
        userId: userRow.id,
        email: userRow.email,
        name: userRow.name,
        role: userRow.role || "child",
        familyId: userRow.family_id,
      });
      await setDevSessionCookie(response.headers, {
        user: {
          id: userRow.id,
          email: userRow.email || "",
          name: userRow.name || "",
          role: userRow.role || "child",
          familyId: userRow.family_id,
        },
      });
      return response;
    }

    // Production Mode: Use Supabase Auth
    if (!hasSupabaseConfig()) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = await getSupabaseMiddlewareClient(request);
    const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Sync user to our database if not present. A user that exists in Supabase but
    // not locally gets their own family; never the first family in the table.
    let familyId: string | null = null;
    let role = "parent";
    try {
      const rawDb = getRawDb();
      if (rawDb) {
        const existingUser = rawDb.prepare(`SELECT family_id, role FROM users WHERE id = ?`).get(user.id) as any;
        if (!existingUser) {
          const now = new Date().toISOString();
          familyId = `family-${crypto.randomUUID()}`;
          rawDb.prepare(
            `INSERT INTO families (id, name, slug, week_start_day, teams_enabled, created_at, updated_at) VALUES (?, ?, ?, 0, 0, ?, ?)`
          ).run(familyId, `${user.email?.split("@")[0] || "My"}'s Family`, familyId, now, now);

          rawDb.prepare(
            `INSERT INTO users (id, email, name, role, avatar_url, family_id, points_total, created_at, updated_at) VALUES (?, ?, ?, 'parent', NULL, ?, 0, ?, ?)`
          ).run(user.id, user.email || "", body?.name || user.user_metadata?.name || "", familyId, now, now);
        } else {
          familyId = existingUser.family_id || null;
          role = existingUser.role || "child";
          rawDb.prepare(`UPDATE users SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), user.id);
        }
      }
    } catch (dbError) {
      error({ err: dbError }, "[SIGNIN] Database sync failed");
    }

    return NextResponse.json({
      ok: true,
      userId: user.id,
      email: user.email,
      name: user.user_metadata?.name || "",
      role,
      familyId,
    });
  } catch {
    error("[SIGNIN] Unhandled error");
    return NextResponse.json({ error: "Sign in failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    if (process.env.AUTH_MODE === "dev") {
      const cookieHeader = request.headers.get("cookie") || "";
      const setCookie = cookieHeader.split(";").find((c: string) => c.includes(DEV_COOKIE_NAME));
      if (!setCookie) return NextResponse.json({ authenticated: false });
      const value = setCookie.replace(`${DEV_COOKIE_NAME}=`, "").trim();
      const user = await verifyDevSession(value);
      if (user) {
        return NextResponse.json({ authenticated: true, user: { id: user.id, email: user.email, role: user.role || "child", name: user.name || "" } });
      }
      return NextResponse.json({ authenticated: false });
    }

    if (!hasSupabaseConfig()) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = await getSupabaseMiddlewareClient(request);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      return NextResponse.json({ authenticated: true, user: { id: session.user.id, email: session.user.email,
        role: session.user.user_metadata?.role || "child", name: session.user.user_metadata?.name || "" } });
    }
    return NextResponse.json({ authenticated: false });
  } catch {
    return NextResponse.json({ authenticated: false, error: "Failed to check session" }, { status: 500 });
  }
}
