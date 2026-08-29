import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createDevSession, setDevSessionCookie, DEV_COOKIE_NAME } from "@/lib/dev-auth";
import * as schema from "@/db/schema";
import { eq, sql, count } from "drizzle-orm";
import { info, error } from "@/lib/logger.server";
import { slugify } from "@/lib/slugify";
import { rawInsert } from "@/db/drizzle";

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body?.email || !body?.password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  // ─── Dev Mode: Mock sign in ────────────────────────────────
  if (process.env.AUTH_MODE === "dev") {
    const email = body?.email?.toLowerCase().trim() || "";
    const name = body?.name || "Dev User";

    let userId: string = `dev-user-${crypto.randomUUID()}`;
    let role: string = "child";
    let familyId: string | null = null;

    // Check DB for existing user by email, or create new with first-user logic
    try {
      const db = await import("@/db/drizzle").then(m => m.initDb());
      if (db) {
        // Look up existing user by email
        const users = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);

        if (users[0]) {
          // Return existing user with their stored role
          userId = users[0].id;
          role = users[0].role || "child";
          familyId = users[0].family_id || null;

          // Ensure family exists for this user
          if (familyId) {
            const families = await db.select().from(schema.families).where(eq(schema.families.id, familyId)).limit(1);
            if (!families[0]) {
              await rawInsert("families", {
                id: familyId,
                name: "Dev Family",
                slug: "dev-family",
                week_start_day: 0,
                teams_enabled: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }
          }
        } else {
          // New user - check if any users exist to determine role
          const countResult = await db.select({ count: count() }).from(schema.users).limit(1);
          role = (countResult[0]?.count ?? 0) === 0 ? "admin" : "child";

          // Generate a random fake user ID
          userId = `dev-user-${crypto.randomUUID()}`;

          // Find or create family
          const families = await db.select().from(schema.families).limit(1);
          if (families[0]) {
            familyId = families[0].id;
          } else {
            const slug = `family-${Date.now()}`;
            const newFamily = await rawInsert("families", {
              id: `family-${Date.now()}`,
              name: `${name}'s Family`,
              slug,
              week_start_day: 0,
              teams_enabled: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
            familyId = newFamily?.id || null;
          }

          // Create user in DB
          await rawInsert("users", {
            id: userId,
            email: email || null,
            name: name,
            role: role,
            avatar_url: null,
            family_id: familyId,
            points_total: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }
    } catch (dbError) {
      error({ err: dbError }, "[DEV SIGNIN] Database sync failed");

      // Fallback: first user is admin if no DB available
      role = "admin";
      userId = `dev-user-${crypto.randomUUID()}`;
    }

    const session = createDevSession({ userId });
    session.user.role = role;
    session.user.familyId = familyId;
    session.user.name = name || session.user.name;
    session.user.email = email || session.user.email;

    const response = NextResponse.json({
      ok: true,
      userId: session.user.id,
      email: session.user.email,
      role: role,
      message: "Sign in successful (dev mode)"
    });

    setDevSessionCookie(response.headers, session);
    return response;
  }

  // ─── Production Mode: Use Supabase Auth ─────────────────────
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
            const { name, value, options } = cookie;
            let cookieStr = `${name}=${value}`;
            if (options) {
              for (const [key, val] of Object.entries(options)) {
                cookieStr += `; ${key}=${val}`;
              }
            }
          }
        },
      }
    }
  );

  const signInResult = await supabase.auth.signInWithPassword({
    email: body.email.toLowerCase().trim(),
    password: body.password,
  });

  if (signInResult.error) {
    return NextResponse.json(
      { error: signInResult.error.message || "Failed to sign in" },
      { status: 401 }
    );
  }

  const session = signInResult.data.session;
  if (!session) {
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }

  // Ensure DB user record exists after sign in — use dynamic import to avoid bundling better-sqlite3
  try {
    const { initDb } = await import("@/db/drizzle");
    const db = await initDb();
    if (db) {
      const existingUser = (await db.select().from(schema.users).where(eq(schema.users.id, session.user.id)).limit(1))[0];

      if (!existingUser) {
        // Generate a default slug for auto-created family
        const slug = slugify(session.user.email || "family");

        // Check if a family with this slug already exists
        const existingFamilyRows = await db.select().from(schema.families)
          .where(eq(schema.families.slug, slug))
          .limit(1);

        let familyId: string | null = null;

        if (existingFamilyRows[0]) {
          familyId = existingFamilyRows[0].id;
        } else {
          // Auto-create a family for the new user
          const newFamily = await rawInsert("families", {
            id: `family-${Date.now()}`,
            name: session.user.email?.split("@")[0] || "My Family",
            slug,
            week_start_day: 0,
            teams_enabled: false,
          });

          if (newFamily) {
            familyId = newFamily.id;
          }
        }

        // Determine role: first user in the system gets admin
        const countResult = await db.select({ count: count() }).from(schema.users).limit(1);
        const userRole = (countResult[0]?.count ?? 0) === 0 ? "admin" : "child";

        // Create DB user record with family association
        await rawInsert("users", {
          id: session.user.id,
          email: session.user.email || null,
          name: session.user.user_metadata?.name || body.name || "User",
          role: userRole,
          avatar_url: session.user.user_metadata?.avatar_url || null,
          family_id: familyId,
          points_total: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } else if (existingUser.email !== session.user.email) {
        // Update email if it changed
        await db.update(schema.users).set({
          email: session.user.email || null,
          name: session.user.user_metadata?.name || existingUser.name,
          role: session.user.user_metadata?.role || existingUser.role,
          avatarUrl: session.user.user_metadata?.avatar_url || existingUser.avatarUrl,
          updatedAt: new Date().toISOString(),
        }).where(eq(schema.users.id, session.user.id));
      }
    }
  } catch (dbError) {
    error({ err: dbError }, "[SIGNIN] Database sync failed");
  }

  const response = new Response(
    JSON.stringify({
      ok: true,
      userId: session.user.id,
      email: session.user.email,
      role: session.user.user_metadata?.role || "child",
      message: "Sign in successful"
    }),
    { status: 200 }
  );

  const cookieName = `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL!.split("//")[1].split(".")[0]}${process.env.NODE_ENV === 'production' ? '-auth' : ''}-token`;
  response.headers.append(
    "set-cookie",
    `${cookieName}=${encodeURIComponent(JSON.stringify({
      access_token: session.access_token,
      token_type: "bearer",
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      refresh_token: session.refresh_token,
      user: {
        id: session.user.id,
        aud: session.user.aud,
        email: session.user.email,
        phone: session.user.phone,
        app_metadata: session.user.app_metadata,
        user_metadata: session.user.user_metadata,
        identities: session.user.identities,
      }
    }))}; Path=/; Secure; HttpOnly; SameSite=Lax`
  );

  return response;
}
