import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });
    const reviewId = (await params).reviewId;
    const result = rawDb.prepare(
      `SELECT r.*, j.name as job_name, u.name as reviewer_name FROM reviews r LEFT JOIN jobs j ON r.job_id = j.id LEFT JOIN users u ON r.reviewer_id = u.id WHERE r.id = ?`
    ).get(reviewId) as any;
    if (!result) return NextResponse.json({ error: "Review not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Get review failed");
    return NextResponse.json({ error: "Failed to fetch review" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });
    const reviewId = (await params).reviewId;
    const body = await request.json();
    const { status, notes, approvedBy } = body;
    if (!status && !notes && !approvedBy) return NextResponse.json({ error: "At least one field to update is required" }, { status: 400 });

    const now = new Date().toISOString();
    const fields: string[] = ["updated_at = ?"];
    const values: any[] = [now];
    if (status) { fields.push("status = ?"); values.push(status); }
    if (notes !== undefined) { fields.push("notes = ?"); values.push(notes); }
    if (approvedBy) { fields.push("approved_by = ?"); values.push(approvedBy); }
    values.push(reviewId);
    rawDb.prepare(`UPDATE reviews SET ${fields.join(", ")} WHERE id = ?`).run(...values);

    const result = rawDb.prepare(`SELECT * FROM reviews WHERE id = ?`).get(reviewId) as any;
    return NextResponse.json(result);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Update review failed");
    return NextResponse.json({ error: "Failed to update review" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });
    const reviewId = (await params).reviewId;
    rawDb.prepare(`DELETE FROM reviews WHERE id = ?`).run(reviewId);
    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Delete review failed");
    return NextResponse.json({ error: "Failed to delete review" }, { status: 500 });
  }
}
