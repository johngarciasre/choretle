import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ familyId: string }> }) {
  try {
    const auth = verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const familyId = (await params).familyId;

    const familyRows = rawDb.prepare(`SELECT * FROM families WHERE id = ?`).get(familyId) as any;
    if (!familyRows) return NextResponse.json({ error: "Family not found" }, { status: 404 });

    const users = rawDb.prepare(`SELECT * FROM users WHERE family_id = ?`).all(familyId) as any[];

    return NextResponse.json({
      id: familyRows.id, name: familyRows.name, slug: familyRows.slug,
      timezone: familyRows.timezone || "America/New_York",
      weekStartDay: familyRows.week_start_day ?? 0,
      theme: familyRows.theme || "coral",
      teamsEnabled: familyRows.teams_enabled ?? false,
      users: (users || []).map((u: any) => ({
        id: u.id, name: u.name, email: u.email, role: u.role,
        avatarUrl: u.avatar_url, pointsTotal: u.points_total || 0,
      })),
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Family GET failed");
    return NextResponse.json({ error: "Failed to fetch family" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) return NextResponse.json({ error: "Family ID required" }, { status: 400 });

    const body = await request.json();
    const { name, slug, timezone, weekStartDay, theme, teamsEnabled } = body;

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    // Verify user belongs to this family
    const userFamilyRows = rawDb.prepare(`SELECT role FROM users WHERE id = ? AND family_id = ?`).get(auth.userId, familyId) as any;
    if (!userFamilyRows || userFamilyRows.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

    const updates: string[] = ["updated_at = ?"];
    const values: any[] = [new Date().toISOString()];
    if (name !== undefined) { updates.push("name = ?"); values.push(name); }
    if (slug !== undefined) {
      // Check slug uniqueness
      const existingFamilyRows = rawDb.prepare(`SELECT id FROM families WHERE slug = ? AND id != ?`).get(slug, familyId) as any;
      if (existingFamilyRows) return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
      updates.push("slug = ?"); values.push(slug);
    }
    if (timezone !== undefined) { updates.push("timezone = ?"); values.push(timezone); }
    if (weekStartDay !== undefined) { updates.push("week_start_day = ?"); values.push(weekStartDay); }
    if (theme !== undefined) { updates.push("theme = ?"); values.push(theme); }
    if (teamsEnabled !== undefined) { updates.push("teams_enabled = ?"); values.push(teamsEnabled ? 1 : 0); }
    values.push(familyId);

    rawDb.prepare(`UPDATE families SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    const updatedFamilyRows = rawDb.prepare(`SELECT * FROM families WHERE id = ?`).get(familyId) as any;
    return NextResponse.json({
      id: updatedFamilyRows.id, name: updatedFamilyRows.name, slug: updatedFamilyRows.slug,
      timezone: updatedFamilyRows.timezone || "America/New_York",
      weekStartDay: updatedFamilyRows.week_start_day ?? 0,
      theme: updatedFamilyRows.theme || "coral",
      teamsEnabled: updatedFamilyRows.teams_enabled ?? false,
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Family PUT failed");
    return NextResponse.json({ error: "Failed to update family" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const familyId = auth.familyId || request.nextUrl.searchParams.get("familyId");
    if (!familyId) return NextResponse.json({ error: "Family ID required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const userFamilyRows = rawDb.prepare(`SELECT role FROM users WHERE id = ? AND family_id = ?`).get(auth.userId, familyId) as any;
    if (!userFamilyRows || userFamilyRows.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

    rawDb.prepare(`DELETE FROM users WHERE family_id = ?`).run(familyId);
    rawDb.prepare(`DELETE FROM families WHERE id = ?`).run(familyId);
    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Family DELETE failed");
    return NextResponse.json({ error: "Failed to delete family" }, { status: 500 });
  }
}
