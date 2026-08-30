import { NextRequest, NextResponse } from "next/server";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const familyId = auth.familyId;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    let sql: string;
    const params: any[] = [familyId];
    if (status) {
      sql = `SELECT r.*, j.name as job_name, u.name as reviewer_name FROM reviews r LEFT JOIN jobs j ON r.job_id = j.id LEFT JOIN users u ON r.reviewer_id = u.id WHERE r.family_id = ? AND r.status = ? ORDER BY r.created_at DESC`;
      params.push(status);
    } else {
      sql = `SELECT r.*, j.name as job_name, u.name as reviewer_name FROM reviews r LEFT JOIN jobs j ON r.job_id = j.id LEFT JOIN users u ON r.reviewer_id = u.id WHERE r.family_id = ? ORDER BY r.created_at DESC`;
    }

    const reviews = rawDb.prepare(sql).all(...params) as any[];
    return NextResponse.json(reviews);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Get reviews failed");
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const familyId = auth.familyId;
    const body = await request.json();
    const { jobId, reviewerId, notes, status } = body;
    if (!jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 });

    const rawDb = getRawDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });

    const now = new Date().toISOString();
    const reviewId = `rev-${Date.now()}`;
    rawDb.prepare(
      `INSERT INTO reviews (id, family_id, job_id, reviewer_id, notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(reviewId, familyId, jobId, reviewerId || null, notes || null, status || "pending", now, now);

    const review = rawDb.prepare(`SELECT * FROM reviews WHERE id = ?`).get(reviewId) as any;
    return NextResponse.json(review);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Create review failed");
    return NextResponse.json({ error: "Failed to create review" }, { status: 500 });
  }
}
