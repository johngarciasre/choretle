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

export default function JobPage() {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data for now
    setJob({
      id: "1",
      name: "Clean the kitchen",
      description: "Clean up the kitchen including counters, stove, and sink.",
      points: 10,
      status: "todo",
    });
    setLoading(false);
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  const handleStatusChange = async () => {
    if (!job) return;
    const newStatus = job.status === "todo" ? "doing" : job.status === "doing" ? "done" : "done";
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Choretle</h1>
        <div className="flex gap-4">
          <Link href="/dashboard" className="hover:underline">Dashboard</Link>
          <Link href="/jobs" className="hover:underline">Jobs</Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-4">{job?.name}</h2>
          <p className="text-gray-500 dark:text-gray-400">{job?.description}</p>
          <p className="mt-2 font-bold">Points: {job?.points}</p>
        </section>

        {/* Status Change */}
        <section>
          <h3 className="text-lg font-semibold mb-2">Status</h3>
          <div className="flex gap-4">
            {["todo", "doing", "done"].map((status) => (
              <button
                key={status}
                onClick={() => handleStatusChange()}
                className={`px-4 py-2 rounded-lg ${job?.status === status ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-700"}`}
              >
                {status}
              </button>
            ))}
          </div>
        </section>

        {/* History */}
        <section>
          <h3 className="text-lg font-semibold mb-2">History</h3>
          <ul className="space-y-2">
            <li className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">Job created on {new Date().toLocaleDateString()}</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
