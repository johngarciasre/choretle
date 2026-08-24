"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageShell, Card, Badge, EmptyState, PageLoader } from "@/components/ui";
import { Button } from "@/components/ui";

interface ReviewItem {
  review: {
    id: string;
    jobId: string;
    status: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  };
  job: {
    id: string;
    name: string;
    status: string;
    verifyRequired: boolean;
  } | null;
  reviewer: {
    id: string;
    name: string;
  } | null;
}

export default function ReviewQueuePage() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    typeof window !== "undefined" && (document.title = "Choretle - Review Queue");
    fetchReviews();
  }, [filter]);

  async function fetchReviews() {
    try {
      const familyId = localStorage.getItem("familyId") || "";
      const headers: Record<string, string> = {};
      if (familyId) headers["x-family-id"] = familyId;
      
      const res = await fetch(`/api/reviews?status=${filter}`, {
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        setReviews(data);
      }
    } catch (error) {
      console.error("Fetch reviews failed:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleReviewAction(reviewId: string, newStatus: string) {
    try {
      const familyId = localStorage.getItem("familyId") || "";
      await fetch(`/api/reviews/${reviewId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(familyId ? { "x-family-id": familyId } : {}),
        },
        body: JSON.stringify({ status: newStatus, notes }),
      });

      setReviewingId(null);
      setNotes("");
      fetchReviews();
    } catch (error) {
      console.error("Review action failed:", error);
      alert("Failed to update review");
    }
  }

  if (loading) return <PageLoader label="Loading review queue..." />;

  return (
    <PageShell>
      <Card accent="coral" className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-bold text-ink">Review Queue</h1>
          <div className="flex gap-2">
            {["pending", "approved", "rejected"].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 py-1 rounded-full text-sm font-bold transition-colors ${
                  filter === status
                    ? "bg-grape text-white"
                    : "bg-cream border-2 border-ink/15 hover:border-grape/40 text-ink/70"
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {reviews.length === 0 ? (
          <EmptyState icon={<span className="text-2xl">✓</span>} title="No pending reviews" message="All caught up!" />
        ) : (
          <div className="space-y-4">
            {reviews.map(({ review, job, reviewer }) => (
              <Card key={review.id} accent="sunny" className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-lg font-bold text-ink">
                      {job?.name || "Unknown Job"}
                    </h3>
                    <p className="text-sm text-ink/60">
                      Submitted by {reviewer?.name || "System"} •{" "}
                      {new Date(review.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge status={review.status === "pending" ? "warning" : review.status === "approved" ? "success" : "error"}>
                    {review.status}
                  </Badge>
                </div>

                {review.notes && (
                  <p className="text-sm text-ink/70 italic bg-cream p-3 rounded-xl">
                    "{review.notes}"
                  </p>
                )}

                {reviewingId === review.id ? (
                  <div className="space-y-2 pt-2 border-t border-ink/10">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add review notes..."
                      className="w-full px-4 py-2 rounded-xl border-2 border-ink/15 bg-white focus:border-grape focus:outline-none font-bold text-ink"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button variant="success" onClick={() => handleReviewAction(review.id, "approved")}>
                        Approve & Complete
                      </Button>
                      <Button variant="warning" onClick={() => handleReviewAction(review.id, "doing")}>
                        Mark for Rework
                      </Button>
                      <Button variant="ghost" onClick={() => setReviewingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-2">
                    <Button variant="primary" onClick={() => { setReviewingId(review.id); setNotes(review.notes || ""); }}>
                      Review
                    </Button>
                    <Link href={`/jobs/${review.jobId}`} className="px-4 py-2 rounded-full font-bold border-2 border-ink/15 hover:border-grape/40 transition-colors text-ink">
                      View Job
                    </Link>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </Card>
    </PageShell>
  );
}
