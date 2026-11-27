import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { setDevSessionCookie, verifyDevSession, DEV_COOKIE_NAME } from "@/lib/dev-auth";
import { getDb } from "@/db";
import { getMembership } from "@/lib/membership";
import { error } from "@/lib/logger.server";

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Every signup starts its own household. Attaching a new person to an existing
 * household is reserved for the invite-code flow, otherwise a new account would
 * land inside the first household's data.
 */
async function createHousehold(name: string): Promise<string> {
  const db = getDb();
  const now = new Date().toISOString();
  const householdId = `household-${crypto.randomUUID()}`;
  await db
    .prepare(
      `insert into households (id, name, slug, week_start_day, teams_enabled, created_at, updated_at)
       values (?, ?, ?, 0, false, ?, ?)`,
    )
    .run(householdId, `${name || "My"}'s Household`, householdId, now, now);
  return householdId;
}

/** An invite is usable once, and only until it expires. */
async function findUsableInvite(code: string) {
  const invite = (await getDb().prepare(`select * from invites where code = ?`).get(code)) as any;
  if (!invite || invite.used) return null;
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return null;
  return invite;
}

async function redeemInvite(invite: any): Promise<void> {
  await getDb()
    .prepare(`update invites set used = 1, updated_at = ? where id = ?`)
    .run(new Date().toISOString(), invite.id);
}

async function ensureMembership(userId: string, householdId: string, role: string): Promise<void> {
  const db = getDb();
  const existing = (await db
    .prepare(`select id from memberships where user_id = ? and household_id = ?`)
    .get(userId, householdId)) as { id: string } | undefined;
  if (existing) {
    await db.prepare(`update memberships set role = ? where id = ?`).run(role, existing.id);
    return;
  }
  await db
    .prepare(`insert into memberships (id, household_id, user_id, role, points_total) values (?, ?, ?, ?, 0)`)
    .run(`mem-${crypto.randomUUID()}`, householdId, userId, role);
}

async function linkSupabaseIdentity(userId: string, providerUid: string, email: string | null): Promise<void> {
  const db = getDb();
  const existing = (await db
    .prepare(`select id from auth_identities where provider = 'supabase' and provider_uid = ?`)
    .get(providerUid)) as { id: string } | undefined;
  if (existing) return;
  await db
    .prepare(
      `insert into auth_identities (id, user_id, provider, provider_uid, email) values (?, ?, 'supabase', ?, ?)`,
    )
    .run(`ident-${crypto.randomUUID()}`, userId, providerUid, email);
}

async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (process.env.AUTH_MODE === "dev") {
      const email = body?.email?.toLowerCase().trim() || "";
      const name = body?.name || "Dev User";
      const inviteCode = (body?.inviteCode || "").trim().toLowerCase();
      const now = new Date().toISOString();
      const db = getDb();

      try {
        const existingUser = (await db
          .prepare(`select id, email, name from users where email = ?`)
          .get(email)) as { id: string; email: string; name: string } | undefined;

        const invite = inviteCode ? await findUsableInvite(inviteCode) : null;
        if (inviteCode && !invite) {
          return NextResponse.json(
            { error: "That household code is invalid, already used, or expired." },
            { status: 400 },
          );
        }
        if (invite && existingUser) {
          const current = await getMembership(existingUser.id);
          if (current) {
            return NextResponse.json({ error: "This account is already part of a household." }, { status: 409 });
          }
        }

        let userId: string;
        let role: string;
        let householdId: string;

        if (existingUser) {
          userId = existingUser.id;
          const current = await getMembership(userId);
          if (invite) {
            householdId = invite.household_id;
            role = invite.role || "child";
          } else if (current) {
            householdId = current.householdId;
            role = current.role;
          } else {
            householdId = await createHousehold(name);
            role = "parent";
          }
          await db.prepare(`update users set name = ?, updated_at = ? where id = ?`).run(name, now, userId);
        } else {
          role = invite ? invite.role || "child" : "parent";
          householdId = invite ? invite.household_id : await createHousehold(name);
          userId = `dev-user-${crypto.randomUUID()}`;
          await db
            .prepare(`insert into users (id, email, name, avatar_url, created_at, updated_at) values (?, ?, ?, NULL, ?, ?)`)
            .run(userId, email, name, now, now);
        }

        await ensureMembership(userId, householdId, role);
        if (invite) await redeemInvite(invite);

        const response = NextResponse.json(
          {
            ok: true,
            userId,
            email,
            role,
            householdId,
            household_id: householdId,
            message: "Sign up successful. Welcome to Choretle!",
            requiresEmailConfirmation: false,
          },
          { status: 200 },
        );
        await setDevSessionCookie(response.headers, {
          user: { id: userId, email, name, role, householdId },
        });
        return response;
      } catch (dbError) {
        error({ err: dbError }, "[SIGNUP] Database operations failed");
        return NextResponse.json({ error: "Sign up failed" }, { status: 500 });
      }
    }

    // Production mode: Supabase Auth.
    if (!hasSupabaseConfig()) {
      return NextResponse.json(
        { error: "Server configuration error: Supabase credentials not found." },
        { status: 500 },
      );
    }

    // Validate the invite before creating a Supabase account, so a bad code
    // cannot leave an orphaned auth user behind.
    const inviteCode = (body?.inviteCode || "").trim().toLowerCase();
    let invite: any = null;
    if (inviteCode) {
      invite = await findUsableInvite(inviteCode);
      if (!invite) {
        return NextResponse.json(
          { error: "That household code is invalid, already used, or expired." },
          { status: 400 },
        );
      }
    }
    const role = invite ? invite.role || "child" : "parent";

    const supabase = await getSupabaseMiddlewareClient(request);
    const {
      data: { user },
      error: signUpError,
    } = await supabase.auth.signUp({
      email: body?.email || "",
      password: body?.password || "",
      options: { data: { name: body?.name || "", role } },
    });

    if (signUpError || !user) {
      return NextResponse.json({ error: signUpError?.message || "Sign up failed" }, { status: 400 });
    }

    let householdId: string | null = null;
    try {
      const db = getDb();
      const linked = (await db
        .prepare(`select user_id from auth_identities where provider = 'supabase' and provider_uid = ?`)
        .get(user.id)) as { user_id: string } | undefined;

      const now = new Date().toISOString();
      let userId = linked?.user_id;
      if (!userId) {
        const newUserId = `user-${crypto.randomUUID()}`;
        userId = newUserId;
        const targetHousehold: string = invite ? invite.household_id : await createHousehold(body?.name || "");
        householdId = targetHousehold;
        await db
          .prepare(
            `insert into users (id, email, name, avatar_url, created_at, updated_at) values (?, ?, ?, NULL, ?, ?)`,
          )
          .run(newUserId, user.email || null, body?.name || "", now, now);
        await linkSupabaseIdentity(newUserId, user.id, user.email ?? null);
        await ensureMembership(newUserId, targetHousehold, role);
        if (invite) await redeemInvite(invite);
      } else {
        const membership = await getMembership(userId);
        householdId = membership?.householdId ?? null;
        await db.prepare(`update users set updated_at = ? where id = ?`).run(now, userId);
      }
    } catch (dbError) {
      error({ err: dbError }, "[SIGNUP] Database sync failed");
    }

    return NextResponse.json(
      {
        ok: true,
        userId: user.id,
        email: user.email || "",
        role,
        householdId,
        household_id: householdId,
        message: "Sign up successful. Welcome to Choretle!",
        requiresEmailConfirmation: false,
      },
      { status: 200 },
    );
  } catch {
    error("[SIGNUP] Unhandled error");
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
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
      return NextResponse.json(
        { error: "Server configuration error: Supabase credentials not found." },
        { status: 500 },
      );
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
