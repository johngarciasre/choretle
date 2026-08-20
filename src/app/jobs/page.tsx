"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Job {
  id: string;
  name: string;
  description: string;
  points: number;
  status: "todo" | "doing" | "done";
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data for now
    setJobs([
      { id: "1", name: "Clean the kitchen", description: "Clean up the kitchen", points: 10, status: "todo" },
      { id: "2", name: "Take out the trash", description: "Take out the trash", points: 5, status: "doing" },
      { id: "3", name: "Vacuum the living room", description: "Vacuum the living room", points: 15, status: "done" },
    ]);
    setLoading(false);
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Choretle</h1>
        <div className="flex gap-4">
          <Link href="/dashboard" className="hover:underline">Dashboard</Link>
          <Link href="/jobs" className="hover:underline text-indigo-600 font-semibold">Jobs</Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-4">Jobs</h2>
          {jobs.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No jobs found.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {jobs.map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`} className="block p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                  <h3 className="font-semibold">{job.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{job.description}</p>
                  <p className="mt-2 font-bold">{job.points} pts</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
