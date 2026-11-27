import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { DEV_COOKIE_NAME, setDevSessionCookie, verifyDevSession } from "@/lib/dev-auth";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { clientKey, clearAttempts, tooManyAttempts } from "@/lib/rate-limit";
import { getMembership } from "@/lib/membership";

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

async function POST(request: NextRequest) {
  try {
    const attemptKey = clientKey(request, "signin");
    if (tooManyAttempts(attemptKey)) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const body = await request.json();
    const { email, password } = body;

    if (process.env.AUTH_MODE === "dev") {
      const db = getDb();
      const userRow = (await db
        .prepare(`select id, email, name from users where email = ?`)
        .get(String(email || "").toLowerCase())) as
        | { id: string; email: string | null; name: string }
        | undefined;
      if (!userRow) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

      clearAttempts(attemptKey);
      const membership = await getMembership(userRow.id);
      const response = NextResponse.json({
        ok: true,
        userId: userRow.id,
        email: userRow.email,
        name: userRow.name,
        role: membership?.role ?? "child",
        householdId: membership?.householdId ?? null,
        household_id: membership?.householdId ?? null,
      });
      await setDevSessionCookie(response.headers, {
        user: {
          id: userRow.id,
          email: userRow.email || "",
          name: userRow.name || "",
          role: membership?.role ?? "child",
          householdId: membership?.householdId ?? null,
        },
      });
      return response;
    }

    // Production mode: Supabase Auth.
    if (!hasSupabaseConfig()) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = await getSupabaseMiddlewareClient(request);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Sync the Supabase identity to a local person on first sign-in. A user that
    // exists in Supabase but not locally gets their own household.
    let householdId: string | null = null;
    let role = "parent";
    try {
      const db = getDb();
      const linked = (await db
        .prepare(`select user_id from auth_identities where provider = 'supabase' and provider_uid = ?`)
        .get(user.id)) as { user_id: string } | undefined;

      const name = body?.name || user.user_metadata?.name || "";
      const now = new Date().toISOString();
      let userId = linked?.user_id;

      if (!userId) {
        userId = `user-${crypto.randomUUID()}`;
        householdId = `household-${crypto.randomUUID()}`;
        await db
          .prepare(
            `insert into households (id, name, slug, week_start_day, teams_enabled, created_at, updated_at)
             values (?, ?, ?, 0, false, ?, ?)`,
          )
          .run(householdId, `${user.email?.split("@")[0] || "My"}'s Household`, householdId, now, now);
        await db
          .prepare(`insert into users (id, email, name, avatar_url, created_at, updated_at) values (?, ?, ?, NULL, ?, ?)`)
          .run(userId, user.email || null, name, now, now);
        await db
          .prepare(
            `insert into auth_identities (id, user_id, provider, provider_uid, email) values (?, ?, 'supabase', ?, ?)`,
          )
          .run(`ident-${crypto.randomUUID()}`, userId, user.id, user.email ?? null);
        await db
          .prepare(`insert into memberships (id, household_id, user_id, role, points_total) values (?, ?, ?, ?, 0)`)
          .run(`mem-${crypto.randomUUID()}`, householdId, userId, role);
      } else {
        const membership = await getMembership(userId);
        householdId = membership?.householdId ?? null;
        role = membership?.role ?? "child";
        await db.prepare(`update users set updated_at = ? where id = ?`).run(now, userId);
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
      householdId,
      household_id: householdId,
    });
  } catch {
    error("[SIGNIN] Unhandled error");
    return NextResponse.json({ error: "Sign in failed" }, { status: 500 });
  }
}

async function GET(request: NextRequest) {
  try {
    if (process.env.AUTH_MODE === "dev") {
      const cookieHeader = request.headers.get("cookie") || "";
      const setCookie = cookieHeader.split(";").find((c: string) => c.includes(DEV_COOKIE_NAME));
      if (!setCookie) return NextResponse.json({ authenticated: false });
      const value = setCookie.replace(`${DEV_COOKIE_NAME}=`, "").trim();
      const user = await verifyDevSession(value);
      if (user) {
        return NextResponse.json({
          authenticated: true,
          user: { id: user.id, email: user.email, role: user.role || "child", name: user.name || "" },
        });
      }
      return NextResponse.json({ authenticated: false });
    }

    if (!hasSupabaseConfig()) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = await getSupabaseMiddlewareClient(request);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
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
    return NextResponse.json({ authenticated: false });
  } catch {
    return NextResponse.json({ authenticated: false, error: "Failed to check session" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
const POST_impl = withTenant(POST);
export { POST_impl as POST };
