import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { slugify } from "@/lib/slugify";
import { error } from "@/lib/logger.server";
import { createDevSession, setDevSessionCookie, verifyDevSession } from "@/lib/dev-auth";
import { verifyAuth, extractUserId } from "@/lib/auth";

/**
 * GET /api/household?id=<id>
 * Fetch a household by ID (used by Household page to load household data)
 */
async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    const url = new URL(request.url);
    const householdId = url.searchParams.get("id");

    if (!householdId) {
      return NextResponse.json({ error: "Household ID is required" }, { status: 400 });
    }
    if (!auth || auth.householdId !== householdId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Fetch household data using raw SQL (Drizzle ORM fails on SQLite)
    const householdRow = await rawDb.prepare(`SELECT * FROM households WHERE id = ? LIMIT 1`).get(householdId) as any;

    if (!householdRow) {
      return NextResponse.json({ ok: false, error: "Household not found" }, { status: 404 });
    }

    const users = await rawDb.prepare(`SELECT u.id, u.name, u.email, u.avatar_url, m.role, m.points_total FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.household_id = ?`).all(householdId) as any[];

    return NextResponse.json({ ok: true, household: householdRow, users });
  } catch (e) {
    error({ err: String(e), stack: (e as Error).stack }, "Household GET failed");
    return NextResponse.json({ ok: false, error: "Failed to fetch household" }, { status: 500 });
  }
}

/**
 * POST /api/household
 * Create a new household and associate the current user with it
 */
async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    let userId: string | null = auth?.userId ?? null;

    // Fallback: user may be authenticated but have no household yet (e.g., first-time create)
    if (!userId) {
      userId = await extractUserId(request);
    }

    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    if (!body?.name) {
      return NextResponse.json({ error: "Household name is required" }, { status: 400 });
    }

    const rawDb = getDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Generate a unique slug — increment suffix if there's a collision
    let slug = slugify(body.name);
    let suffix = 1;
    const baseSlug = slug;

    // Guard: user must not already belong to a household (one household per member)
    const existingUser = await rawDb.prepare(`SELECT household_id FROM memberships WHERE user_id = ? LIMIT 1`).get(userId) as any;

    if (existingUser?.household_id) {
      return NextResponse.json({ error: "You are already a member of a household" }, { status: 409 });
    }

    let existingHousehold = await rawDb.prepare(`SELECT * FROM households WHERE slug = ? LIMIT 1`).get(slug) as any;

    while (existingHousehold) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
      existingHousehold = await rawDb.prepare(`SELECT * FROM households WHERE slug = ? LIMIT 1`).get(slug) as any;
      if (!existingHousehold) break;
      // Safety: stop after 100 attempts to avoid infinite loops
      if (suffix > 100) {
        return NextResponse.json({ error: "Could not generate unique household slug" }, { status: 500 });
      }
    }

    const now = new Date().toISOString();

    // Create the household
    const householdId = `household-${crypto.randomUUID()}`;
    await rawDb.prepare(
      `INSERT INTO households (id, name, slug, week_start_day, teams_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, false, ?, ?)`
    ).run(householdId, body.name, slug, body.weekStartDay ?? 0, now, now);

    // Associate the current user with this household
    await rawDb
      .prepare(`INSERT INTO memberships (id, household_id, user_id, role, points_total, joined_at) VALUES (?, ?, ?, 'parent', 0, ?)`)
      .run(`mem-${crypto.randomUUID()}`, householdId, userId, now);

    const newHousehold = await rawDb.prepare(`SELECT * FROM households WHERE id = ?`).get(householdId) as any;

    const response = NextResponse.json({
      ok: true,
      household: newHousehold,
    });

    // Update dev session cookie if in dev mode
    if (process.env.AUTH_MODE === "dev") {
      const cookieHeader = request.headers.get("cookie") || "";
      const setCookie = cookieHeader.split(";").find((c) => c.includes("dev-session"));
      if (setCookie) {
        const value = setCookie.replace("dev-session=", "").trim();
        const user = await verifyDevSession(value);
        if (user) {
          const session = createDevSession({ userId: user.id });
          session.user.email = user.email;
          session.user.name = user.name;
          session.user.role = user.role;
          session.user.householdId = newHousehold.id;
          await setDevSessionCookie(response.headers, session);
        }
      }
    }

    return response;
  } catch (e) {
    error({ err: String(e), stack: (e as Error).stack }, `Create household failed`);
    return NextResponse.json(
      { error: e instanceof Error && e.message ? e.message : "Failed to create household" },
      { status: 500 }
    );
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
const POST_impl = withTenant(POST);
export { POST_impl as POST };
