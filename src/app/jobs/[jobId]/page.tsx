"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageShell, Card, Badge, EmptyState, PageLoader } from "@/components/ui";
import { Button } from "@/components/ui";
import PhotoCarousel from "@/components/PhotoCarousel";
import PhotoUploadModal from "@/components/PhotoUploadModal";

interface Job {
  id: string;
  name: string;
  description: string;
  points: number;
  status: "todo" | "doing" | "done" | "under_review";
  verifyRequired?: boolean;
  reviewedAt?: string;
  assignedTo?: string;
  dueDate?: string;
  completedAt?: string;
}

interface Comment {
  id: string;
  content: string;
  userId: string;
  userName: string;
  createdAt: string;
}

interface HistoryEntry {
  id: string;
  action: string;
  details: string;
  userId: string;
  userName: string;
  createdAt: string;
}

interface SubtaskInstance {
  subtask: {
    id: string;
    completedAt: string | null;
    pointsAwarded: number;
  };
  details: {
    id: string;
    name: string;
    points: number;
  } | null;
}

const jobId = typeof window !== "undefined" ? new URL(window.location.href).pathname.split("/")[2] : "";

const fetchJob = async () => {
  try {
    const res = await fetch(`/api/jobs/${jobId}`);
    if (!res.ok) throw new Error("Failed to fetch job");
    return await res.json();
  } catch (error) {
    console.error("Fetch job failed:", error);
    return null;
  }
};

const fetchSubtasks = async (jobId: string) => {
  try {
    const res = await fetch(`/api/tasks/subtasks?jobId=${jobId}`);
    if (!res.ok) throw new Error("Failed to fetch subtasks");
    return await res.json();
  } catch (error) {
    console.error("Fetch subtasks failed:", error);
    return [];
  }
};

const fetchPhotos = async (objectType: string, objectId: string) => {
  try {
    const res = await fetch(`/api/photos?objectType=${objectType}&objectId=${objectId}`);
    if (!res.ok) throw new Error("Failed to fetch photos");
    return await res.json();
  } catch (error) {
    console.error("Fetch photos failed:", error);
    return [];
  }
};

export default function JobPage() {
  const [job, setJob] = useState<Job | null>(null);
  const [validNextStatuses, setValidNextStatuses] = useState<string[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [subtaskInstances, setSubtaskInstances] = useState<SubtaskInstance[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    Promise.all([fetchJob(), fetchSubtasks(jobId), fetchPhotos("job", jobId)]).then(([jobData, subtasks, photoData]) => {
      if (jobData) {
        setJob(jobData.job);
        setValidNextStatuses(jobData.validNextStatuses || []);
        setComments(jobData.comments || []);
        setHistory(jobData.history || []);
      }
      setSubtaskInstances(subtasks || []);
      setPhotos(photoData || []);
      setLoading(false);
    });
  }, [jobId]);

  const handleStatusChange = async (newStatus: string) => {
    if (!job) return;
    
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update job");
      }

      const updated = await res.json();
      setJob(updated.job);
      
      if (newStatus === "done") {
        window.location.reload();
      }
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to update job status");
    }
  };

  const handleAddComment = async () => {
    if (!jobId || !commentText.trim()) return;
    
    try {
      // Note: In production, this would use the user's auth token
      await fetch(`/api/jobs/${jobId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText.trim() }),
      });

      setCommentText("");
      window.location.reload();
    } catch (error) {
      console.error("Add comment failed:", error);
      alert("Failed to add comment");
    }
  };

  const handleSubtaskComplete = async (jobSubtaskId: string) => {
    try {
      const res = await fetch(`/api/tasks/subtasks/${jobSubtaskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedAt: new Date().toISOString() }),
      });

      if (!res.ok) throw new Error("Failed to complete subtask");
      
      setSubtaskInstances(prev =>
        prev.map((s: SubtaskInstance) =>
          s.subtask.id === jobSubtaskId
            ? { ...s, subtask: { ...s.subtask, completedAt: new Date().toISOString() } }
            : s
        )
      );
    } catch (error) {
      console.error("Complete subtask failed:", error);
      alert("Failed to complete subtask");
    }
  };

  const completedSubtasks = subtaskInstances.filter((s: SubtaskInstance) => s.subtask.completedAt).length;
  const totalSubtasks = subtaskInstances.length;
  const allCompleted = totalSubtasks > 0 && completedSubtasks === totalSubtasks;

  if (loading) return <PageLoader label="Loading job..." />;
  if (!job) return <EmptyState icon={<span className="text-2xl">📝</span>} title="Job not found" message="The job you're looking for doesn't exist." />;

  return (
    <PageShell>
      <Card accent="coral" className="space-y-6">
        {/* Job Details */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-3xl font-bold text-ink flex-1">{job.name}</h2>
            <Badge status={
              job.status === "done" ? "success" :
              job.status === "under_review" ? "warning" :
              job.status === "doing" ? "info" : "neutral"
            }>
              {job.status}
            </Badge>
          </div>
          
          <p className="text-ink/60">{job.description}</p>
          
          <div className="flex items-center gap-4">
            <Badge status="points">{job.points} pts</Badge>
            {job.verifyRequired && (
              <Badge status={job.reviewedAt ? "success" : "warning"}>
                {job.reviewedAt ? "Reviewed" : "Requires Review"}
              </Badge>
            )}
            {totalSubtasks > 0 && (
              <Badge status="neutral">
                {completedSubtasks}/{totalSubtasks} subtasks
              </Badge>
            )}
          </div>
        </section>

        {/* Subtasks Section */}
        {totalSubtasks > 0 && (
          <Card accent={allCompleted ? "success" : "teal"} className="pt-6 space-y-4">
            <h3 className="font-display text-lg font-bold text-ink">Subtask Progress</h3>
            
            <div className="space-y-2">
              {subtaskInstances.map((instance: SubtaskInstance) => (
                <label
                  key={instance.subtask.id}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                    instance.subtask.completedAt ? "bg-success/10" : "bg-white hover:bg-grape/5"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!instance.subtask.completedAt}
                    onChange={() => handleSubtaskComplete(instance.subtask.id)}
                    disabled={job.status === "done"}
                    className="accent-grape"
                  />
                  {instance.details?.name ? (
                    <span className={`flex-1 font-medium ${
                      instance.subtask.completedAt ? "text-success line-through" : "text-ink"
                    }`}>
                      {instance.details.name}
                    </span>
                  ) : (
                    <span className="flex-1 font-medium text-ink">Subtask</span>
                  )}
                  {instance.details?.points && instance.details.points > 0 && (
                    <Badge status="points" className="text-xs">{instance.details.points} pts</Badge>
                  )}
                </label>
              ))}
            </div>

            {/* Progress Bar */}
            <div className="w-full h-6 bg-cream rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-width ${
                  allCompleted ? "bg-success" : "bg-grape"
                }`}
                style={{ width: `${totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0}%` }}
              />
            </div>
            <p className="text-sm text-ink/60 text-center">
              {completedSubtasks} of {totalSubtasks} completed
            </p>
          </Card>
        )}

        {/* Photo Carousel */}
        <PhotoCarousel photos={photos} objectType="job" objectId={job.id} />

        {/* Status Change */}
        <Card accent="teal" className="pt-6 space-y-4">
          <h3 className="font-display text-lg font-bold text-ink">Status</h3>
          <div className="flex flex-wrap gap-3">
            {job.status === "todo" && (
              <>
                <Button variant="grape" onClick={() => handleStatusChange("doing")}>
                  Start
                </Button>
                <Link href="/jobs" className="px-4 py-2 rounded-full font-bold border-2 border-ink/15 hover:bg-grape/5 transition-colors text-ink">
                  Cancel
                </Link>
              </>
            )}
            {job.status === "doing" && (
              <>
                <Button variant="success" onClick={() => handleStatusChange("done")}>
                  Done
                </Button>
                {job.verifyRequired ? (
                  <Button variant="warning" onClick={() => handleStatusChange("under_review")}>
                    Submit for Review
                  </Button>
                ) : (
                  <Button variant="grape" onClick={() => handleStatusChange("todo")}>
                    Start Over
                  </Button>
                )}
              </>
            )}
            {job.status === "under_review" && (
              <>
                <Button variant="success" onClick={() => handleStatusChange("done")}>
                  Mark Complete
                </Button>
                <Button variant="grape" onClick={() => handleStatusChange("doing")}>
                  Request Rework
                </Button>
              </>
            )}
            {job.status === "done" && (
              <>
                <Button variant="success" disabled>Completed</Button>
                {job.verifyRequired && job.reviewedAt && (
                  <span className="text-sm text-success font-medium flex items-center">
                    ✓ Reviewed on {new Date(job.reviewedAt!).toLocaleDateString()}
                  </span>
                )}
              </>
            )}
          </div>
        </Card>

        {/* History */}
        <Card accent="sunny" className="pt-6 space-y-4">
          <h3 className="font-display text-lg font-bold text-ink">History</h3>
          {history.length === 0 ? (
            <p className="text-sm text-ink/60">No history yet.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((entry) => (
                <li key={entry.id} className="flex items-center gap-2 p-3 bg-cream rounded-xl">
                  <span className="w-2 h-2 rounded-full bg-sunny flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm text-ink/70">{entry.details}</span>
                    <span className="text-xs text-ink/40 ml-2">by {entry.userName} • {new Date(entry.createdAt).toLocaleDateString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Comments Section */}
        <Card accent="teal" className="pt-6 space-y-4">
          <h3 className="font-display text-lg font-bold text-ink">Comments</h3>
          {comments.length > 0 && (
            <div className="space-y-3 pb-3">
              {comments.map((comment) => (
                <div key={comment.id} className="p-3 bg-white rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-ink">{comment.userName}</span>
                    <span className="text-xs text-ink/40">{new Date(comment.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-ink/70">{comment.content}</p>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
              className="w-full px-4 py-2 rounded-xl border-2 border-ink/15 bg-cream focus:border-grape focus:outline-none font-bold text-ink"
              rows={3}
            />
            <Button variant="primary" onClick={handleAddComment}>
              Post Comment
            </Button>
          </div>
        </Card>

        {/* Back Link */}
        <section className="flex justify-end pt-4 border-t border-ink/10">
          <Link href="/jobs" className="px-6 py-2 rounded-full font-bold border-2 border-ink/15 hover:bg-grape/5 transition-colors text-ink">
            Back to Jobs
          </Link>
        </section>
      </Card>

      {showUpload && (
        <PhotoUploadModal
          isOpen={showUpload}
          onClose={() => setShowUpload(false)}
          objectType="job"
          objectId={job.id}
        />
      )}
    </PageShell>
  );
}
