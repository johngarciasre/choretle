import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { DEV_COOKIE_NAME, parseDevSession } from "@/lib/dev-auth";
import { getRawDb } from "@/db/drizzle";
import { setDevSessionCookie } from "@/lib/dev-auth";
import { error } from "@/lib/logger.server";

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (process.env.AUTH_MODE === "dev") {
      const rawDb = getRawDb();
      if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

      const userRow = rawDb.prepare(`SELECT * FROM users WHERE email = ?`).get(email?.toLowerCase()) as any;
      if (!userRow) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

      const userId = userRow.id;
      const familyId = userRow.family_id;

      // Create dev session cookie
      const sessionObj = { user: { id: userId, email: email || "", name: userRow.name || "", role: userRow.role || "child", familyId } };
      const encoded = encodeURIComponent(JSON.stringify(sessionObj));
      const response = NextResponse.json({
        ok: true,
        userId,
        email: userRow.email,
        name: userRow.name,
        role: userRow.role || "child",
        familyId,
      });
      response.headers.set("set-cookie", `dev-session=${encoded}; path=/; secure=false; httpOnly=true`);
      return response;
    }

    // Production Mode: Use Supabase Auth
    if (!hasSupabaseConfig()) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = await getSupabaseMiddlewareClient(request);
    const { data: { user, session }, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Sync user to our database if not present
    try {
      const rawDb = getRawDb();
      if (rawDb) {
        const existingUser = rawDb.prepare(`SELECT id FROM users WHERE id = ?`).get(user.id) as any;
        if (!existingUser) {
          // Check/create family
          const countFamilies = rawDb.prepare(`SELECT COUNT(*) as cnt FROM families`).get() as any;
          let familyId: string | null = null;
          if ((countFamilies?.cnt ?? 0) === 0) {
            const familySlug = `family-${Date.now()}`;
            const now = new Date().toISOString();
            rawDb.prepare(
              `INSERT INTO families (id, name, slug, week_start_day, teams_enabled, created_at, updated_at) VALUES (?, ?, ?, 0, 0, ?, ?)`
            ).run(`family-${Date.now()}`, `${user.email?.split("@")[0] || ""}\'s Family`, familySlug, now, now);
            familyId = `family-${Date.now()}`;
          } else {
            const fam = rawDb.prepare(`SELECT id FROM families LIMIT 1`).get() as any;
            familyId = fam?.id || null;
          }

          rawDb.prepare(
            `INSERT INTO users (id, email, name, role, avatar_url, family_id, points_total, created_at, updated_at) VALUES (?, ?, ?, 'child', NULL, ?, 0, ?, ?)`
          ).run(user.id, user.email || "", body?.name || "", familyId, new Date().toISOString(), new Date().toISOString());
        } else {
          // Update last login
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
      role: user.user_metadata?.role || "child",
      familyId: null,
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "[SIGNIN] Unhandled error");
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
      const user = parseDevSession(value);
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
  } catch (err) {
    return NextResponse.json({ authenticated: false, error: "Failed to check session" }, { status: 500 });
  }
}
