import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { error } from "@/lib/logger.server";

// ─── Middleware: Verify Auth Token ──────────────────────────────────
async function verifyAuth(request: NextRequest): Promise<{ userId: string; familyId: string } | { error: string }> {
  const cookie = request.cookies.get("auth-token")?.value;
  if (!cookie) {
    return { error: "No token provided" };
  }

  try {
    const parts = cookie.split(".");
    if (parts.length !== 3) {
      return { error: "Invalid token format" };
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const now = Math.floor(Date.now() / 1000);
    
    if (payload.exp && payload.exp < now) {
      return { error: "Token expired" };
    }

    const db = await initDb();
    if (!db) {
      return { error: "Database not initialized" };
    }

    const user = await db.select().from(schema.users).where(eq(schema.users.id, payload.userId)).first();
    if (!user) {
      return { error: "User not found" };
    }

    return { userId: payload.userId, familyId: payload.familyId || user.familyId || "" };
  } catch (error) {
    error({ err: error }, "Token verification failed");
    return { error: "Invalid token" };
  }
}

// ─── GET: Fetch family data ─────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const familyId = url.searchParams.get("id");

    if (!familyId) {
      return NextResponse.json({ error: "Family ID is required" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) {
      throw new Error("Database not initialized");
    }

    // Fetch family data
    const family = await db.select().from(schema.families).where(eq(schema.families.id, familyId)).first();
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
  } catch (error) {
    error({ err: error }, "Family GET failed");
    if (error instanceof Error && error.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to fetch family" }, { status: 500 });
  }
}

// ─── POST: Create a new family ──────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
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
    const existingFamily = await db.select().from(schema.families).where(eq(schema.families.slug, slug)).first();
    if (existingFamily) {
      return NextResponse.json({ error: "A family with this name already exists" }, { status: 409 });
    }

    // Create family with current user as the first member
    const family = await db.insert(schema.families).values({
      name,
      slug,
      weekStartDay: weekStartDay ?? 0,
      teamsEnabled: false,
    }).returning("*");

    // Get the newly created family ID
    const newFamilyId = (family as any[])[0]?.id;

    if (!newFamilyId) {
      return NextResponse.json({ error: "Failed to create family" }, { status: 500 });
    }

    // Add current user to the family
    await db.update(schema.users).set({ familyId: newFamilyId }).where(eq(schema.users.id, authResult.userId));

    // Create a default team for the family (optional)
    const defaultTeam = await db.insert(schema.teams).values({
      familyId: newFamilyId,
      name: "General",
    }).returning("*");

    return NextResponse.json({
      ok: true,
      family: {
        id: newFamilyId,
        name,
        slug,
        teamsEnabled: false,
      },
    });
  } catch (error) {
    error({ err: error }, "Family POST failed");
    if (error instanceof Error && error.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to create family", details: String(error) }, { status: 500 });
  }
}

// ─── PATCH: Update family settings (e.g., teamsEnabled, name, theme) ─────────────
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const url = new URL(request.url);
    const familyId = url.searchParams.get("id");

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

    // Verify user owns this family
    const userFamily = await db.select().from(schema.users).where(
      and(eq(schema.users.id, authResult.userId), eq(schema.users.familyId, familyId))
    ).first();

    if (!userFamily) {
      return NextResponse.json({ error: "You don't have access to this family" }, { status: 403 });
    }

    // Build update object with only provided fields
    const updates: any = { updatedAt: new Date() };
    if (teamsEnabled !== undefined) updates.teamsEnabled = teamsEnabled;
    if (name) {
      const newSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const existingFamily = await db.select().from(schema.families).where(eq(schema.families.slug, newSlug)).first();
      if (existingFamily && existingFamily.id !== familyId) {
        return NextResponse.json({ error: "A family with this name already exists" }, { status: 409 });
      }
      updates.name = name;
      updates.slug = newSlug;
    }
    if (theme) updates.theme = theme;

    // Update family settings
    const updatedFamily = await db.update(schema.families).set(updates)
      .where(eq(schema.families.id, familyId)).returning("*");

    return NextResponse.json({
      ok: true,
      family: updatedFamily[0],
    });
  } catch (error) {
    error({ err: error }, "Family PATCH failed");
    if (error instanceof Error && error.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to update family", details: String(error) }, { status: 500 });
  }
}
