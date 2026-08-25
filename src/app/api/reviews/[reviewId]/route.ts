import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { error } from "@/lib/logger.server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const reviewId = (await params).reviewId;
    
    const result = await db.select({
      review: schema.reviews,
      job: schema.jobs,
      reviewer: schema.users,
    })
      .from(schema.reviews)
      .leftJoin(schema.jobs, eq(schema.reviews.jobId, schema.jobs.id))
      .leftJoin(schema.users, eq(schema.reviews.reviewerId, schema.users.id))
      .where(eq(schema.reviews.id, reviewId))
      .limit(1);

    if (!result || !result[0]) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    error({ err: error }, "Get review failed");
    return NextResponse.json({ error: "Failed to fetch review" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const reviewId = (await params).reviewId;
    const body = await request.json();
    const { status, notes, approvedBy } = body;

    if (!status && !notes && !approvedBy) {
      return NextResponse.json({ error: "At least one field to update is required" }, { status: 400 });
    }

    const updateData: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (approvedBy) updateData.approvedBy = approvedBy;

    const result = await db.update(schema.reviews).set(updateData).where(eq(schema.reviews.id, reviewId)).returning("*");

    if (!result || !result[0]) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    error({ err: error }, "Update review failed");
    return NextResponse.json({ error: "Failed to update review" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const reviewId = (await params).reviewId;
    
    await db.delete(schema.reviews).where(eq(schema.reviews.id, reviewId));
    return NextResponse.json({ success: true });
  } catch (error) {
    error({ err: error }, "Delete review failed");
    return NextResponse.json({ error: "Failed to delete review" }, { status: 500 });
  }
}
