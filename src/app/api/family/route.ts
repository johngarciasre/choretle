import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { slugify } from "@/lib/slugify";
import { error } from "@/lib/logger.server";
import { rawInsert } from "@/db/drizzle";
import { createDevSession, setDevSessionCookie } from "@/lib/dev-auth";
import { verifyAuth, extractUserId } from "@/lib/auth";

/**
 * GET /api/family?id=<id>
 * Fetch a family by ID (used by Family page to load family data)
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const familyId = url.searchParams.get("id");

    if (!familyId) {
      return NextResponse.json({ error: "Family ID is required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Fetch family data using raw SQL (Drizzle ORM fails on SQLite)
    const familyRow = rawDb.prepare(`SELECT * FROM families WHERE id = ? LIMIT 1`).get(familyId) as any;

    if (!familyRow) {
      return NextResponse.json({ ok: false, error: "Family not found" }, { status: 404 });
    }

    // Fetch users in this family (only if authenticated and they belong to it)
    const userId = request.headers.get("x-user-id");
    let users: any[] = [];
    if (userId) {
      const userRecordRow = rawDb.prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`).get(userId) as any;

      // Only return users if the requesting user belongs to this family
      if (userRecordRow && (userRecordRow.family_id === familyId || !userRecordRow.family_id)) {
        users = rawDb.prepare(`SELECT * FROM users WHERE family_id = ?`).all(familyId) as any[];
      }
    }

    return NextResponse.json({ ok: true, family: familyRow, users });
  } catch (e) {
    error({ err: String(e), stack: (e as Error).stack }, "Family GET failed");
    return NextResponse.json({ ok: false, error: "Failed to fetch family" }, { status: 500 });
  }
}

/**
 * POST /api/family
 * Create a new family and associate the current user with it
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    let userId: string | null = auth?.userId ?? null;

    // Fallback: user may be authenticated but have no family yet (e.g., first-time create)
    if (!userId) {
      userId = extractUserId(request);
    }

    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    if (!body?.name) {
      return NextResponse.json({ error: "Family name is required" }, { status: 400 });
    }

    const rawDb = getRawDb();
    if (!rawDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Generate a unique slug — increment suffix if there's a collision
    let slug = slugify(body.name);
    let suffix = 1;
    const baseSlug = slug;

    // Guard: user must not already belong to a family (one family per member)
    const existingUser = rawDb.prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`).get(userId) as any;

    if (existingUser?.family_id) {
      return NextResponse.json({ error: "You are already a member of a family" }, { status: 409 });
    }

    let existingFamily = rawDb.prepare(`SELECT * FROM families WHERE slug = ? LIMIT 1`).get(slug) as any;

    while (existingFamily) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
      existingFamily = rawDb.prepare(`SELECT * FROM families WHERE slug = ? LIMIT 1`).get(slug) as any;
      if (!existingFamily) break;
      // Safety: stop after 100 attempts to avoid infinite loops
      if (suffix > 100) {
        return NextResponse.json({ error: "Could not generate unique family slug" }, { status: 500 });
      }
    }

    const now = new Date().toISOString();
    const ts = Date.now();

    // Create the family
    const familyId = `family-${ts}`;
    rawDb.prepare(
      `INSERT INTO families (id, name, slug, week_start_day, teams_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(familyId, body.name, slug, body.weekStartDay ?? 0, 0, now, now);

    // Associate the current user with this family
    rawDb.prepare(
      `UPDATE users SET family_id = ?, updated_at = ? WHERE id = ?`
    ).run(familyId, now, userId);

    const newFamily = rawDb.prepare(`SELECT * FROM families WHERE id = ?`).get(familyId) as any;

    const response = NextResponse.json({
      ok: true,
      family: newFamily,
    });

    // Update dev session cookie if in dev mode
    if (process.env.AUTH_MODE === "dev") {
      const cookieHeader = request.headers.get("cookie") || "";
      const setCookie = cookieHeader.split(";").find((c) => c.includes("dev-session"));
      if (setCookie) {
        const value = setCookie.replace("dev-session=", "").trim();
        const user = JSON.parse(decodeURIComponent(value));
        const u = user.user || user;
        if (u.id) {
          const session = createDevSession({ userId: u.id });
          session.user.familyId = newFamily.id;
          setDevSessionCookie(response.headers, session);
        }
      }
    }

    return response;
  } catch (e) {
    error({ err: String(e), stack: (e as Error).stack }, `Create family failed`);
    return NextResponse.json(
      { error: e instanceof Error && e.message ? e.message : "Failed to create family" },
      { status: 500 }
    );
  }
}
