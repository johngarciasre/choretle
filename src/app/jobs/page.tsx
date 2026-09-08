"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageShell, PageHeader, EmptyState, Badge, PageLoader } from "@/components/ui";
import { error } from "@/lib/logger";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";

interface Job {
  id: string;
  name: string;
  description: string;
  points: number;
  status: "todo" | "doing" | "done";
  assigneeId?: string;
  assigneeName?: string;
  dueDate?: string;
}

interface JobGroup {
  date: string;
  label: string;
  jobs: Job[];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";

  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

async function fetchJobs() {
  try {
    // Get family ID from auth endpoint
    const authRes = await fetch("/api/auth/me", { credentials: "include" });
    if (!authRes.ok) throw new Error("Not authenticated");
    const authData = await authRes.json();
    const familyId = authData.familyId;

    if (!familyId) {
      throw new Error("No family ID");
    }

    const res = await fetch(`/api/jobs?familyId=${familyId}`, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch jobs");
    const data = await res.json();
    
    // Normalize snake_case DB columns to camelCase
    return (data as any[]).map((j: any) => ({
      id: j.id,
      name: j.name,
      description: j.description,
      points: j.points || 0,
      status: j.status,
      assigneeId: j.assigned_to || j.assigneeId,
      assigneeName: j.assignee_name || j.assigneeName,
      dueDate: j.due_date || j.dueDate,
    }));
  } catch (err) {
    error({ err }, "Fetch jobs failed");
    // Mock data for now
    return [
      { id: "1", name: "Clean the kitchen", description: "Clean up the kitchen", points: 10, status: "todo" },
      { id: "2", name: "Take out the trash", description: "Take out the trash", points: 5, status: "doing" },
      { id: "3", name: "Vacuum the living room", description: "Vacuum the living room", points: 15, status: "done" },
    ];
  }
}

export default function JobsPage() {
  const authChecked = useAuthRedirect();
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

  if (!authChecked) return <PageShell><PageLoader label="Checking authentication..." /></PageShell>;
  if (loading) return <PageLoader label="Loading jobs..." />;

  // Group jobs by due date
  const grouped: Map<string, JobGroup> = new Map();
  for (const job of jobs) {
    const key = job.dueDate || "unassigned";
    const label = key === "unassigned" ? "Unassigned" : formatDate(key);
    if (!grouped.has(key)) {
      grouped.set(key, { date: key, label, jobs: [] });
    }
    grouped.get(key)!.jobs.push(job);
  }

  // Sort groups: today, tomorrow, upcoming, then past, then unassigned
  const sortedGroups = Array.from(grouped.values()).sort((a, b) => {
    if (a.label === "Unassigned") return 1;
    if (b.label === "Unassigned") return -1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  return (
    <PageShell>
      <PageHeader title="Jobs" subtitle="View and manage all jobs for your family" />

      <main className="space-y-6">
        {sortedGroups.length === 0 ? (
          <EmptyState icon={<span className="text-2xl">📝</span>} title="No jobs found" message="Create a job to get started!" />
        ) : (
          sortedGroups.map((group) => (
            <section key={group.date}>
              <h2 className="text-lg font-semibold text-ink/70 mb-3">{group.label}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.jobs.map((job) => (
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
            </section>
          ))
        )}
      </main>
    </PageShell>
  );
}
