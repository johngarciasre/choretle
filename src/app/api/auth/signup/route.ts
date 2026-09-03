import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { createDevSession, setDevSessionCookie, DEV_COOKIE_NAME, parseDevSession } from "@/lib/dev-auth";
import { getRawDb } from "@/db/drizzle";
import { error, info } from "@/lib/logger.server";

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

async function getNewUserRole(rawDb: any, familyId: string | null): Promise<string> {
  // The first person in a family is always admin (adult)
  const countResult = rawDb.prepare(
    familyId ? `SELECT COUNT(*) as cnt FROM users WHERE family_id = ?` : `SELECT COUNT(*) as cnt FROM users`
  ).get(familyId || undefined) as any;
  return (countResult?.cnt ?? 0) === 0 ? "admin" : "child";
}

async function getOrCreateFamily(rawDb: any, name: string): Promise<{ familyId: string; slug: string }> {
  const ts = Date.now();
  const now = new Date().toISOString();
  // Check if a family already exists
  const existing = rawDb.prepare(`SELECT id FROM families LIMIT 1`).get() as any;
  if (existing) {
    return { familyId: existing.id, slug: "" };
  }
  // Create a new family
  const familySlug = `family-${ts}`;
  rawDb.prepare(
    `INSERT INTO families (id, name, slug, week_start_day, teams_enabled, created_at, updated_at) VALUES (?, ?, ?, 0, 0, ?, ?)`
  ).run(`family-${ts}`, `${name}'s Family`, familySlug, now, now);
  return { familyId: `family-${ts}`, slug: familySlug };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("[SIGNUP] Request received, AUTH_MODE:", process.env.AUTH_MODE);

    if (process.env.AUTH_MODE === "dev") {
      const email = body?.email?.toLowerCase().trim() || "";
      const name = body?.name || "Dev User";
      const now = new Date().toISOString();

      let role = "child";
      let familyId: string | null = null;
      let userId = "";

      try {
        const rawDb = getRawDb();
        if (!rawDb) throw new Error("Database not available");

        // Reuse existing user with the same email instead of creating a new one
        const existingUser = rawDb.prepare(`SELECT id, role, family_id FROM users WHERE email = ?`).get(email) as any;
        if (existingUser) {
          userId = existingUser.id;
          familyId = existingUser.family_id;
          role = existingUser.role || "child";
          // Update name in case it changed
          rawDb.prepare(
            `UPDATE users SET name = ?, updated_at = ? WHERE id = ?`
          ).run(name, now, userId);
        } else {
          // New user — ensure a family exists
          const fam = await getOrCreateFamily(rawDb, name);
          familyId = fam.familyId;

          // First person in this family is admin
          role = await getNewUserRole(rawDb, familyId);

          userId = `dev-user-${crypto.randomUUID()}`;
          rawDb.prepare(
            `INSERT INTO users (id, email, name, role, avatar_url, family_id, points_total, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, 0, ?, ?)`
          ).run(userId, email, name, role, familyId, now, now);
        }
      } catch (dbError) {
        error({ err: dbError }, "[SIGNUP] Database operations failed");
      }

      // Set dev session cookie
      const sessionObj = { user: { id: userId, email: email || "", name: name || "Dev User", role: role || "child", familyId } };
      const encoded = encodeURIComponent(JSON.stringify(sessionObj));
      const response = NextResponse.json(
        { ok: true, userId, email, familyId: familyId || null,
          message: "Sign up successful. Welcome to Choretle!", requiresEmailConfirmation: false },
        { status: 200 }
      );
      response.headers.set("set-cookie", `dev-session=${encoded}; path=/; secure=false; httpOnly=true`);
      return response;
    }

    // Production Mode: Use Supabase Auth
    if (!hasSupabaseConfig()) {
      return NextResponse.json({ error: "Server configuration error: Supabase credentials not found." }, { status: 500 });
    }

    const supabase = await getSupabaseMiddlewareClient(request);
    const { data: { user, session } } = await supabase.auth.signUp({
      email: body?.email || "",
      password: body?.password || "",
      options: { data: { name: body?.name || "", role: "child" } },
    });

    if (!user) {
      return NextResponse.json({ error: "Sign up failed" }, { status: 500 });
    }

    // Sync user to our database
    try {
      const rawDb = getRawDb();
      if (rawDb) {
        const existingUser = rawDb.prepare(`SELECT role FROM users WHERE id = ?`).get(user.id) as any;
        if (!existingUser) {
          const fam = await getOrCreateFamily(rawDb, body?.name || "");
          const famId = fam.familyId;

          // First person in this family is admin
          const userRole = await getNewUserRole(rawDb, famId);

          rawDb.prepare(
            `INSERT INTO users (id, email, name, role, avatar_url, family_id, points_total, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, 0, ?, ?)`
          ).run(user.id, user.email || "", body?.name || "", userRole, famId, new Date().toISOString(), new Date().toISOString());
        } else {
          // Update last login
          rawDb.prepare(`UPDATE users SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), user.id);
        }
      }
    } catch (dbError) {
      error({ err: dbError }, "[SIGNUP] Database sync failed");
    }

    return NextResponse.json(
      { ok: true, userId: user.id, email: user.email || "",
        familyId: null, message: "Sign up successful. Welcome to Choretle!", requiresEmailConfirmation: false },
      { status: 200 }
    );
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "[SIGNUP] Unhandled error");
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
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
      return NextResponse.json({ error: "Server configuration error: Supabase credentials not found." }, { status: 500 });
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
