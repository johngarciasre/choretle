import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
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

    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Fetch family data
    const familyRows = await db.select().from(schema.families)
      .where(eq(schema.families.id, familyId))
      .limit(1);

    const family = familyRows[0];
    if (!family) {
      return NextResponse.json({ ok: false, error: "Family not found" }, { status: 404 });
    }

    // Fetch users in this family (only if authenticated and they belong to it)
    const userId = request.headers.get("x-user-id");
    let users: any[] = [];
    if (userId) {
      const userRecordRows = await db.select().from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      const userRecord = userRecordRows[0];

      // Only return users if the requesting user belongs to this family
      if (userRecord && (userRecord.familyId === familyId || !userRecord.familyId)) {
        users = await db.select().from(schema.users)
          .where(eq(schema.users.familyId, familyId));
      }
    }

    return NextResponse.json({ ok: true, family, users });
  } catch (e) {
    error({ err: e }, "Family GET failed");
    return NextResponse.json({ ok: false, error: "Failed to fetch family" }, { status: 500 });
  }
}

/**
 * POST /api/family
 * Create a new family and associate the current user with it
 */
export async function POST(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
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

    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Generate a unique slug — increment suffix if there's a collision
    let slug = slugify(body.name);
    let suffix = 1;
    const baseSlug = slug;

    // Guard: user must not already belong to a family (one family per member)
    const existingUser = await db.select().from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    
    if (existingUser[0]?.familyId) {
      return NextResponse.json({ error: "You are already a member of a family" }, { status: 409 });
    }

    const existingFamilyRows = await db.select().from(schema.families)
      .where(eq(schema.families.slug, slug))
      .limit(1);

    while (existingFamilyRows[0]) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
      const checkRows = await db.select().from(schema.families)
        .where(eq(schema.families.slug, slug))
        .limit(1);
      if (!checkRows[0]) break;
      // Safety: stop after 100 attempts to avoid infinite loops
      if (suffix > 100) {
        return NextResponse.json({ error: "Could not generate unique family slug" }, { status: 500 });
      }
    }

    const now = new Date().toISOString();

    // Create the family
    const newFamily = await rawInsert("families", {
      id: `family-${Date.now()}`,
      name: body.name,
      slug,
      week_start_day: body.weekStartDay ?? 0,
      teams_enabled: false,
      created_at: now,
      updated_at: now,
    });

    if (!newFamily) {
      return NextResponse.json({ error: "Failed to create family" }, { status: 500 });
    }

    // Associate the current user with this family
    await db.update(schema.users)
      .set({ familyId: newFamily.id, updated_at: new Date().toISOString() })
      .where(eq(schema.users.id, userId));

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
    error({ err: e }, "Create family failed");
    return NextResponse.json({ error: "Failed to create family" }, { status: 500 });
  }
}
