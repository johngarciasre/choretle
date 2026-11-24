import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { setDevSessionCookie, verifyDevSession, DEV_COOKIE_NAME } from "@/lib/dev-auth";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Every signup starts its own family. Attaching new users to an existing family
 * is reserved for the invite-code flow, otherwise any new household would land
 * inside the first family's data.
 */
function createFamily(rawDb: any, name: string): string {
  const now = new Date().toISOString();
  const familyId = `family-${crypto.randomUUID()}`;
  rawDb.prepare(
    `INSERT INTO families (id, name, slug, week_start_day, teams_enabled, created_at, updated_at) VALUES (?, ?, ?, 0, 0, ?, ?)`
  ).run(familyId, `${name || "My"}'s Family`, familyId, now, now);
  return familyId;
}

/** An invite is usable once, and only until it expires. */
function findUsableInvite(rawDb: any, code: string) {
  const invite = rawDb.prepare(`SELECT * FROM invites WHERE code = ?`).get(code) as any;
  if (!invite || invite.used) return null;
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return null;
  return invite;
}

function redeemInvite(rawDb: any, invite: any) {
  rawDb.prepare(`UPDATE invites SET used = 1, updated_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    invite.id,
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (process.env.AUTH_MODE === "dev") {
      const email = body?.email?.toLowerCase().trim() || "";
      const name = body?.name || "Dev User";
      const inviteCode = (body?.inviteCode || "").trim().toLowerCase();
      const now = new Date().toISOString();

      const rawDb = getRawDb();
      if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

      try {
        // Reuse existing user with the same email instead of creating a new one
        const existingUser = rawDb.prepare(`SELECT id, role, family_id FROM users WHERE email = ?`).get(email) as any;

        const invite = inviteCode ? findUsableInvite(rawDb, inviteCode) : null;
        if (inviteCode && !invite) {
          return NextResponse.json({ error: "That family code is invalid, already used, or expired." }, { status: 400 });
        }
        if (invite && existingUser?.family_id) {
          return NextResponse.json({ error: "This account is already part of a family." }, { status: 409 });
        }

        let userId: string;
        let role: string;
        let familyId: string | null;
        if (existingUser) {
          userId = existingUser.id;
          role = invite ? invite.role || "child" : existingUser.role || "child";
          familyId = invite ? invite.family_id : existingUser.family_id;
          rawDb.prepare(
            `UPDATE users SET name = ?, role = ?, family_id = ?, updated_at = ? WHERE id = ?`
          ).run(name, role, familyId, now, userId);
        } else {
          role = invite ? invite.role || "child" : "parent";
          familyId = invite ? invite.family_id : createFamily(rawDb, name);
          userId = `dev-user-${crypto.randomUUID()}`;
          rawDb.prepare(
            `INSERT INTO users (id, email, name, role, avatar_url, family_id, points_total, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, 0, ?, ?)`
          ).run(userId, email, name, role, familyId, now, now);
        }
        if (invite) redeemInvite(rawDb, invite);

        const response = NextResponse.json(
          { ok: true, userId, email, role, familyId,
            message: "Sign up successful. Welcome to Choretle!", requiresEmailConfirmation: false },
          { status: 200 }
        );
        await setDevSessionCookie(response.headers, {
          user: { id: userId, email, name, role, familyId },
        });
        return response;
      } catch (dbError) {
        error({ err: dbError }, "[SIGNUP] Database operations failed");
        return NextResponse.json({ error: "Sign up failed" }, { status: 500 });
      }
    }

    // Production Mode: Use Supabase Auth
    if (!hasSupabaseConfig()) {
      return NextResponse.json({ error: "Server configuration error: Supabase credentials not found." }, { status: 500 });
    }

    // Validate the invite before creating a Supabase account, so a bad code
    // cannot leave an orphaned auth user behind.
    const inviteCode = (body?.inviteCode || "").trim().toLowerCase();
    let invite: any = null;
    if (inviteCode) {
      const rawDb = getRawDb();
      if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });
      invite = findUsableInvite(rawDb, inviteCode);
      if (!invite) {
        return NextResponse.json({ error: "That family code is invalid, already used, or expired." }, { status: 400 });
      }
    }
    const role = invite ? invite.role || "child" : "parent";

    const supabase = await getSupabaseMiddlewareClient(request);
    const { data: { user }, error: signUpError } = await supabase.auth.signUp({
      email: body?.email || "",
      password: body?.password || "",
      options: { data: { name: body?.name || "", role } },
    });

    if (signUpError || !user) {
      return NextResponse.json({ error: signUpError?.message || "Sign up failed" }, { status: 400 });
    }

    // Sync user to our database
    let familyId: string | null = null;
    try {
      const rawDb = getRawDb();
      if (rawDb) {
        const existingUser = rawDb.prepare(`SELECT family_id FROM users WHERE id = ?`).get(user.id) as any;
        if (!existingUser) {
          const now = new Date().toISOString();
          familyId = invite ? invite.family_id : createFamily(rawDb, body?.name || "");
          rawDb.prepare(
            `INSERT INTO users (id, email, name, role, avatar_url, family_id, points_total, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, 0, ?, ?)`
          ).run(user.id, user.email || "", body?.name || "", role, familyId, now, now);
          if (invite) redeemInvite(rawDb, invite);
        } else {
          familyId = existingUser.family_id || null;
          rawDb.prepare(`UPDATE users SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), user.id);
        }
      }
    } catch (dbError) {
      error({ err: dbError }, "[SIGNUP] Database sync failed");
    }

    return NextResponse.json(
      { ok: true, userId: user.id, email: user.email || "", role, familyId,
        message: "Sign up successful. Welcome to Choretle!", requiresEmailConfirmation: false },
      { status: 200 }
    );
  } catch {
    error("[SIGNUP] Unhandled error");
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
      const user = await verifyDevSession(value);
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
  } catch {
    return NextResponse.json({ authenticated: false, error: "Failed to check session" }, { status: 500 });
  }
}
