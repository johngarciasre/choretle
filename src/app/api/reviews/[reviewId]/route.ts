import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { canApprove, verifyAuth } from "@/lib/auth";

async function GET(request: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });
    const reviewId = (await params).reviewId;
    const result = await rawDb.prepare(
      `SELECT r.*, j.name as job_name, u.name as reviewer_name FROM reviews r LEFT JOIN jobs j ON r.job_id = j.id LEFT JOIN users u ON r.reviewer_id = u.id WHERE r.id = ? AND r.household_id = ?`
    ).get(reviewId, auth.householdId) as any;
    if (!result) return NextResponse.json({ error: "Review not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Get review failed");
    return NextResponse.json({ error: "Failed to fetch review" }, { status: 500 });
  }
}

async function PUT(request: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });
    // Approving is parent/helper work, and never from a PIN session.
    if (!canApprove(auth)) {
      return NextResponse.json({ error: "Parent or helper access required" }, { status: 403 });
    }
    const reviewId = (await params).reviewId;
    const body = await request.json();
    const { status, notes } = body;
    if (!status && notes === undefined) return NextResponse.json({ error: "At least one field to update is required" }, { status: 400 });
    if (status && !["pending", "approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "status must be pending, approved or rejected" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const fields: string[] = ["updated_at = ?"];
    const values: any[] = [now];
    if (status) { fields.push("status = ?"); values.push(status); }
    if (notes !== undefined) { fields.push("notes = ?"); values.push(notes); }
    // The approver is the session, never a client-supplied id.
    if (status === "approved") { fields.push("approved_by = ?", "reviewer_id = ?"); values.push(auth.userId, auth.userId); }
    values.push(reviewId, auth.householdId);
    await rawDb.prepare(`UPDATE reviews SET ${fields.join(", ")} WHERE id = ? AND household_id = ?`).run(...values);

    const result = await rawDb.prepare(`SELECT * FROM reviews WHERE id = ? AND household_id = ?`).get(reviewId, auth.householdId) as any;
    if (!result) return NextResponse.json({ error: "Review not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Update review failed");
    return NextResponse.json({ error: "Failed to update review" }, { status: 500 });
  }
}

async function DELETE(request: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const rawDb = getDb();
    if (!rawDb) return NextResponse.json({ error: "Database not available" }, { status: 503 });
    // Approving is parent/helper work, and never from a PIN session.
    if (!canApprove(auth)) {
      return NextResponse.json({ error: "Parent or helper access required" }, { status: 403 });
    }
    const reviewId = (await params).reviewId;
    const result = await rawDb.prepare(`DELETE FROM reviews WHERE id = ? AND household_id = ?`).run(reviewId, auth.householdId);
    if (result.changes === 0) return NextResponse.json({ error: "Review not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Delete review failed");
    return NextResponse.json({ error: "Failed to delete review" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
const PUT_impl = withTenant(PUT);
export { PUT_impl as PUT };
const DELETE_impl = withTenant(DELETE);
export { DELETE_impl as DELETE };
