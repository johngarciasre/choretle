"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageShell, PageHeader, EmptyState, Badge, PageLoader } from "@/components/ui";
import { error } from "@/lib/logger";

interface Job {
  id: string;
  name: string;
  description: string;
  points: number;
  status: "todo" | "doing" | "done";
  assigneeId?: string;
  assigneeName?: string;
}

async function fetchJobs() {
  try {
    const res = await fetch("/api/jobs");
    if (!res.ok) throw new Error("Failed to fetch jobs");
    const data = await res.json();
    return data;
  } catch (error) {
    error({ err: error }, "Fetch jobs failed");
    // Mock data for now
    return [
      { id: "1", name: "Clean the kitchen", description: "Clean up the kitchen", points: 10, status: "todo" },
      { id: "2", name: "Take out the trash", description: "Take out the trash", points: 5, status: "doing" },
      { id: "3", name: "Vacuum the living room", description: "Vacuum the living room", points: 15, status: "done" },
    ];
  }
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    typeof window !== "undefined" && (document.title = "Choretle - Jobs");
    fetchJobs().then(data => {
      if (data) {
        setJobs(data);
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <PageLoader label="Loading jobs..." />;

  return (
    <PageShell>
      <PageHeader title="Jobs" subtitle="View and manage all jobs for your family" />

      <main className="space-y-6">
        <section>
          {jobs.length === 0 ? (
            <EmptyState icon={<span className="text-2xl">📝</span>} title="No jobs found" message="Create a job to get started!" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {jobs.map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`} className="block bg-white rounded-2xl shadow-[0_8px_30px_rgba(59,47,99,0.08)] p-6 hover:shadow-lg transition-shadow">
                  <h3 className="font-display text-xl font-bold text-ink">{job.name}</h3>
                  <p className="text-sm text-ink/60 mt-2">{job.description}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <Badge status="points">{job.points} pts</Badge>
                    {job.status !== "todo" && job.assigneeId && (
                      <span className="text-sm text-ink/60 truncate max-w-[120px]">Assignee: {job.assigneeName}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </PageShell>
  );
}
