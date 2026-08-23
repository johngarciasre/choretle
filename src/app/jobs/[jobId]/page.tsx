"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageShell, Card, Badge, EmptyState, PageLoader } from "@/components/ui";
import { Button } from "@/components/ui";

interface Job {
  id: string;
  name: string;
  description: string;
  points: number;
  status: "todo" | "doing" | "done";
}

const taskId = typeof window !== "undefined" ? new URL(window.location.href).pathname.split("/")[2] : "";

const fetchJob = async () => {
  try {
    const res = await fetch(`/api/jobs/${taskId}`);
    if (!res.ok) throw new Error("Failed to fetch job");
    return await res.json();
  } catch (error) {
    console.error("Fetch job failed:", error);
    return {
      id: "1",
      name: "Clean the kitchen",
      description: "Clean up the kitchen including counters, stove, and sink.",
      points: 10,
      status: "todo",
    };
  }
};

export default function JobPage() {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJob().then(data => {
      if (data) {
        setJob(data);
      }
      setLoading(false);
    });
  }, []);

  const handleStatusChange = async () => {
    if (!job) return;
    const newStatus = job.status === "todo" ? "doing" : job.status === "doing" ? "done" : "todo";
    try {
      await fetch("/api/jobs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, status: newStatus }),
      });
      setJob({ ...job, status: newStatus });
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <PageLoader label="Loading job..." />;
  if (!job) return <EmptyState icon={<span className="text-2xl">📝</span>} title="Job not found" message="The job you're looking for doesn't exist." />;

  return (
    <PageShell>
      <Card accent="coral" className="space-y-6">
        {/* Job Details */}
        <section className="space-y-4">
          <h2 className="font-display text-3xl font-bold text-ink">{job.name}</h2>
          <p className="text-ink/60">{job.description}</p>
          <div className="flex items-center gap-4">
            <Badge status="points">{job.points} pts</Badge>
          </div>
        </section>

        {/* Status Change */}
        <Card accent="teal" className="pt-6 space-y-4">
          <h3 className="font-display text-lg font-bold text-ink">Status</h3>
          <div className="flex gap-3">
            {job.status === "todo" && (
              <>
                <Button variant="grape" onClick={handleStatusChange}>
                  Start
                </Button>
                <Link href="/jobs" className="px-4 py-2 rounded-full font-bold border-2 border-ink/15 hover:bg-grape/5 transition-colors text-ink">
                  Cancel
                </Link>
              </>
            )}
            {job.status === "doing" && (
              <>
                <Button variant="success" onClick={handleStatusChange}>
                  Done
                </Button>
                <Button variant="grape" onClick={handleStatusChange}>
                  Start Over
                </Button>
              </>
            )}
            {job.status === "done" && (
              <>
                <Button variant="success" onClick={handleStatusChange}>
                  Done
                </Button>
                <Button variant="grape" onClick={handleStatusChange}>
                  Restart
                </Button>
              </>
            )}
          </div>
        </Card>

        {/* History */}
        <Card accent="sunny" className="pt-6 space-y-4">
          <h3 className="font-display text-lg font-bold text-ink">History</h3>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 p-3 bg-cream rounded-xl">
              <span className="w-2 h-2 rounded-full bg-sunny" />
              <span className="text-sm text-ink/60">Job created on {new Date().toLocaleDateString()}</span>
            </li>
          </ul>
        </Card>

        {/* Back Link */}
        <section className="flex justify-end pt-4 border-t border-ink/10">
          <Link href="/jobs" className="px-6 py-2 rounded-full font-bold border-2 border-ink/15 hover:bg-grape/5 transition-colors text-ink">
            Back to Jobs
          </Link>
        </section>
      </Card>
    </PageShell>
  );
}
