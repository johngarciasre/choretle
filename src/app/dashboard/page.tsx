"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Job {
  id: string;
  name: string;
  status: "todo" | "doing" | "done";
  points: number;
  dueDate: string;
}

interface LeaderboardEntry {
  userId: string;
  name: string;
  avatarUrl?: string;
  totalPoints: number;
  jobsCompleted: number;
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch dashboard data from API
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((data) => {
        setJobs(data.jobs || []);
        setLeaderboard(data.leaderboard || []);
        setLoading(false);
      })
      .catch(() => {
        // Use mock data for now
        setJobs([
          { id: "1", name: "Clean the kitchen", status: "todo", points: 10, dueDate: new Date().toISOString() },
          { id: "2", name: "Take out the trash", status: "doing", points: 5, dueDate: new Date().toISOString() },
          { id: "3", name: "Vacuum the living room", status: "todo", points: 15, dueDate: new Date().toISOString() },
        ]);
        setLeaderboard([
          { userId: "1", name: "Alice", totalPoints: 120, jobsCompleted: 8 },
          { userId: "2", name: "Bob", totalPoints: 95, jobsCompleted: 6 },
          { userId: "3", name: "Charlie", totalPoints: 75, jobsCompleted: 5 },
        ]);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  const openJobs = jobs.filter((j) => j.status !== "done");
  const completedJobs = jobs.filter((j) => j.status === "done").slice(0, 5);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Choretle</h1>
        <div className="flex gap-4">
          <Link href="/dashboard" className="hover:underline">Dashboard</Link>
          <Link href="/tasks" className="hover:underline">Tasks</Link>
          <Link href="/reports" className="hover:underline">Reports</Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Outstanding Jobs */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Outstanding Jobs Today</h2>
          {openJobs.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No outstanding jobs.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {openJobs.map((job) => (
                <div key={job.id} className={cn(
                  "p-4 rounded-lg shadow-sm bg-white dark:bg-gray-800",
                  job.status === "doing" && "border-l-4 border-indigo-500"
                )}>
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium">{job.name}</h3>
                    <span className={cn(
                      "px-2 py-1 rounded-full text-xs font-semibold",
                      job.status === "todo" && "bg-gray-100 dark:bg-gray-700",
                      job.status === "doing" && "bg-indigo-100 dark:bg-indigo-900 text-indigo-600"
                    )}>
                      {job.status}
                    </span>
                  </div>
                  <p className="text-sm mt-2">Points: {job.points}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Completions */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Recently Completed</h2>
          {completedJobs.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No completed jobs yet.</p>
          ) : (
            <ul className="space-y-2">
              {completedJobs.map((job) => (
                <li key={job.id} className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-900 rounded-lg">
                  <span>{job.name}</span>
                  <span className="text-sm">+{job.points} pts</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Leaderboard */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Leaderboard</h2>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            {leaderboard.map((entry, index) => (
              <div key={entry.userId} className="flex justify-between items-center py-3 border-b last:border-b-0">
                <span className="font-medium">{index + 1}. {entry.name}</span>
                <span>{entry.totalPoints} pts</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
