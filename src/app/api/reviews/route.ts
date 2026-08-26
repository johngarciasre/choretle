import { NextRequest, NextResponse } from "next/server";
import { initDb, rawInsert } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { error } from "@/lib/logger.server";

export async function GET(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const familyId = request.headers.get("x-family-id") || new URL(request.url).searchParams.get("familyId");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    if (!familyId) {
      return NextResponse.json({ error: "Family ID required" }, { status: 400 });
    }

    let query: any;
    
    if (status) {
      query = db.select({
        review: schema.reviews,
        job: schema.jobs,
        reviewer: schema.users,
      })
        .from(schema.reviews)
        .leftJoin(schema.jobs, eq(schema.reviews.jobId, schema.jobs.id))
        .leftJoin(schema.users, eq(schema.reviews.reviewerId, schema.users.id))
        .where(and(eq(schema.reviews.familyId, familyId), eq(schema.reviews.status, status)))
        .orderBy(desc(schema.reviews.createdAt));
    } else {
      query = db.select({
        review: schema.reviews,
        job: schema.jobs,
        reviewer: schema.users,
      })
        .from(schema.reviews)
        .leftJoin(schema.jobs, eq(schema.reviews.jobId, schema.jobs.id))
        .leftJoin(schema.users, eq(schema.reviews.reviewerId, schema.users.id))
        .where({ familyId })
        .orderBy(desc(schema.reviews.createdAt));
    }

    const reviews = await query;
    return NextResponse.json(reviews);
  } catch (err) {
    error({ err: err }, "Get reviews failed");
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = await initDb();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const body = await request.json();
    const { jobId, reviewerId, notes, status } = body;
    const familyId = request.headers.get("x-family-id") || new URL(request.url).searchParams.get("familyId");

    if (!familyId || !jobId) {
      return NextResponse.json({ error: "familyId and jobId are required" }, { status: 400 });
    }

    const review = await rawInsert("reviews", {
      id: `rev-${Date.now()}`,
      family_id: familyId,
      job_id: jobId,
      reviewer_id: reviewerId || null,
      notes: notes || null,
      status: status || "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json(review);
  } catch (err) {
    error({ err: err }, "Create review failed");
    return NextResponse.json({ error: "Failed to create review" }, { status: 500 });
  }
}
