import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { error } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const familyId = request.headers.get("x-family-id") || new URL(request.url).searchParams.get("familyId");
    if (!familyId) {
      return NextResponse.json({ slates: [], users: [], family: null });
    }

    // Get family info
    const families = await db.select().from(schema.families).where(eq(schema.families.id, familyId)).limit(1);
    const family = (families as any[])?.[0] || null;

    // Get all users in the family
    const familyUsers = await db.select().from(schema.users).where(eq(schema.users.familyId, familyId));
    const users = (familyUsers as any[]) || [];

    // Get all slates for the family
    const familySlates = await db.select().from(schema.slates).where(eq(schema.slates.familyId, familyId));

    // Get all rotations for these slates
    const slateIds = (familySlates as any[]).map((s: any) => s.id);
    const rotations: any[] = [];
    
    if (slateIds.length > 0) {
      const placeholders = slateIds.map(() => '?').join(',');
      const result = await db.execute(
        sql`${schema.rotations} WHERE ${schema.rotations.slateId} IN (${sql.raw(placeholders)}) ORDER BY order`
      );
      rotations.push(...result);
    }

    // Enrich rotations with user info
    const enrichedRotations: any[] = rotations.map((r: any) => {
      const user = users.find((u: any) => u.id === r.user_id || u.id === r.userId);
      return {
        ...r,
        userName: user?.name || "Unknown",
        userAvatarUrl: user?.avatar_url || user?.avatarUrl,
        userPointsTotal: user?.points_total || user?.pointsTotal || 0,
        userRole: user?.role || "child",
      };
    });

    // Group rotations by slate
    const slatesWithRotations = (familySlates as any[]).map((slate: any) => {
      const slateRotations = enrichedRotations.filter((r: any) => r.slate_id === slate.id || r.slateId === slate.id);
      return {
        ...slate,
        assignments: slateRotations,
      };
    });

    // Get users not yet assigned to any rotation
    const assignedUserIds = new Set(enrichedRotations.map((r: any) => r.user_id || r.userId));
    const unassignedUsers = users.filter((u: any) => !assignedUserIds.has(u.id));

    return NextResponse.json({
      family,
      users: unassignedUsers,
      slates: slatesWithRotations,
    });
  } catch (error) {
    error({ err: error }, "Rotations GET failed");
    return NextResponse.json({ error: "Failed to fetch rotations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const body = await request.json();
    const { id, slateId, userId, order, intervalDays, isActive } = body;

    if (!slateId || !userId) {
      return NextResponse.json({ error: "slateId and userId are required" }, { status: 400 });
    }

    if (id) {
      // Update existing rotation
      const result = await db.update(schema.rotations)
        .set({
          slateId,
          userId,
          order: order || 0,
          intervalDays: intervalDays || 7,
          isActive: isActive !== false,
        })
        .where(eq(schema.rotations.id, id))
        .returning("*");

      return NextResponse.json(result[0]);
    } else {
      // Create new rotation
      const result = await db.insert(schema.rotations).values({
        slateId,
        userId,
        order: order || 0,
        intervalDays: intervalDays || 7,
        isActive: isActive !== false,
      }).returning("*");

      return NextResponse.json(result[0], { status: 201 });
    }
  } catch (error) {
    error({ err: error }, "Rotations POST failed");
    return NextResponse.json({ error: "Failed to save rotation" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await db.delete(schema.rotations).where(eq(schema.rotations.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    error({ err: error }, "Rotations DELETE failed");
    return NextResponse.json({ error: "Failed to delete rotation" }, { status: 500 });
  }
}
