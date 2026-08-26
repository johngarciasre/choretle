import { NextRequest, NextResponse } from "next/server";
import { initDb, rawInsert } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { error } from "@/lib/logger.server";
import { parseDevSession } from "@/lib/dev-auth";

/**
 * Get current user from middleware headers (prod) or dev session cookie (dev mode).
 */
async function getCurrentUser(request: NextRequest): Promise<{ userId: string; familyId: string } | { error: string }> {
  // Check middleware headers first (both prod and dev set these)
  const userId = request.headers.get("x-user-id");
  if (userId) {
    return { userId, familyId: request.headers.get("x-family-id") || "" };
  }

  // Fall back to dev session cookie (for direct requests bypassing middleware)
  if (process.env.AUTH_MODE === "dev") {
    const cookieHeader = request.headers.get("cookie") || "";
    const setCookie = cookieHeader.split(";").find((c) => c.includes("dev-session"));
    if (setCookie) {
      const value = setCookie.replace("dev-session=", "").trim();
      const user = parseDevSession(value);
      if (user) {
        return { userId: user.id, familyId: user.familyId || "" };
      }
    }
  }

  return { error: "Authentication required" };
}

/**
 * Extracts the familyId from the URL path for [familyId] dynamic routes.
 */
function getFamilyIdFromPath(request: NextRequest): string | undefined {
  const url = new URL(request.url);
  const segments = url.pathname.split("/");
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i] === "family" && i + 1 < segments.length) {
      return segments[i + 1];
    }
  }
  return undefined;
}

// ─── GET: Fetch family data ─────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const familyId = getFamilyIdFromPath(request);

    if (!familyId) {
      return NextResponse.json({ error: "Family ID is required" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) {
      throw new Error("Database not initialized");
    }

    // Fetch family data
    const familyRows = await db.select().from(schema.families).where(eq(schema.families.id, familyId)).limit(1);
    const family = familyRows[0];
    
    if (!family) {
      return NextResponse.json({ error: "Family not found" }, { status: 404 });
    }

    // Fetch users in this family
    const users = await db.select().from(schema.users).where(eq(schema.users.familyId, familyId));

    return NextResponse.json({
      ok: true,
      family: family,
      users: (users as any[]),
    });
  } catch (err) {
    error({ err }, "Family GET failed");
    if (err instanceof Error && err.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to fetch family" }, { status: 500 });
  }
}

// ─── POST: Create a new family ──────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const authResult = await getCurrentUser(request);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const body = await request.json();
    const { name, weekStartDay } = body;

    if (!name) {
      return NextResponse.json({ error: "Family name is required" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) {
      throw new Error("Database not initialized");
    }

    // Generate slug from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    // Check if family with this slug already exists
    const existingFamilyRows = await db.select().from(schema.families).where(eq(schema.families.slug, slug)).limit(1);
    if (existingFamilyRows[0]) {
      return NextResponse.json({ error: "A family with this name already exists" }, { status: 409 });
    }

    // Create family with current user as the first member
    const newFamily = await rawInsert("families", {
      id: `family-${Date.now()}`,
      name,
      slug,
      week_start_day: weekStartDay ?? 0,
      teams_enabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const newFamilyId = newFamily?.[0]?.id;

    if (!newFamilyId) {
      return NextResponse.json({ error: "Failed to create family" }, { status: 500 });
    }

    // Add current user to the family
    await db.update(schema.users).set({ familyId: newFamilyId }).where(eq(schema.users.id, authResult.userId));

    // Create a default team for the family
    await rawInsert("teams", {
      id: `team-${Date.now()}`,
      family_id: newFamilyId,
      name: "General",
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      family: {
        id: newFamilyId,
        name,
        slug,
        teamsEnabled: false,
      },
    });
  } catch (err) {
    error({ err }, "Family POST failed");
    if (err instanceof Error && err.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to create family", details: String(err) }, { status: 500 });
  }
}

// ─── PATCH: Update family settings (e.g., teamsEnabled, name, theme) ─────────────
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await getCurrentUser(request);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    // Extract familyId from the URL path
    const familyId = getFamilyIdFromPath(request);

    if (!familyId) {
      return NextResponse.json({ error: "Family ID is required" }, { status: 400 });
    }

    const body = await request.json();
    const { teamsEnabled, name, theme } = body;

    if (teamsEnabled === undefined && !name && !theme) {
      return NextResponse.json({ error: "At least one of teamsEnabled, name, or theme is required" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) {
      throw new Error("Database not initialized");
    }

    // Verify user belongs to this family
    const userFamilyRows = await db.select().from(schema.users).where(
      and(eq(schema.users.id, authResult.userId), eq(schema.users.familyId, familyId))
    ).limit(1);
    const userFamily = userFamilyRows[0];

    if (!userFamily) {
      return NextResponse.json({ error: "You don't have access to this family" }, { status: 403 });
    }

    // Build update object with only provided fields
    const updates: any = { updated_at: new Date().toISOString() };
    if (teamsEnabled !== undefined) updates.teams_enabled = teamsEnabled;
    if (name) {
      const newSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const existingFamilyRows = await db.select().from(schema.families).where(eq(schema.families.slug, newSlug)).limit(1);
      if (existingFamilyRows[0] && existingFamilyRows[0].id !== familyId) {
        return NextResponse.json({ error: "A family with this name already exists" }, { status: 409 });
      }
      updates.name = name;
      updates.slug = newSlug;
    }
    if (theme) updates.theme = theme;

    // Update family settings
    await db.update(schema.families).set(updates)
      .where(eq(schema.families.id, familyId));

    const updatedFamilyRows = await db.select().from(schema.families)
      .where(eq(schema.families.id, familyId)).limit(1);

    return NextResponse.json({
      ok: true,
      family: updatedFamilyRows[0],
    });
  } catch (err) {
    error({ err }, "Family PATCH failed");
    if (err instanceof Error && err.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to update family", details: String(err) }, { status: 500 });
  }
}
