"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface ReportData {
  type: string;
  jobsCompleted: any[];
  jobsInProgress: any[];
  totalPointsEarned: number;
}

export default function ReportsPage() {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reports")
      .then((res) => res.json())
      .then((data) => {
        setReportData(data);
        setLoading(false);
      })
      .catch(() => {
        // Use mock data for now
        setReportData({
          type: "daily",
          jobsCompleted: [
            { id: "1", name: "Clean the kitchen", points: 10 },
            { id: "2", name: "Take out the trash", points: 5 },
          ],
          jobsInProgress: [
            { id: "3", name: "Vacuum the living room", points: 15 },
          ],
          totalPointsEarned: 30,
        });
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Choretle</h1>
        <div className="flex gap-4">
          <Link href="/dashboard" className="hover:underline">Dashboard</Link>
          <Link href="/tasks" className="hover:underline">Tasks</Link>
          <Link href="/reports" className="hover:underline text-indigo-600 font-semibold">Reports</Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Summary */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
              <p className="text-sm text-gray-500 dark:text-gray-400">Points Earned</p>
              <p className="text-2xl font-bold">{reportData?.totalPointsEarned}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
              <p className="text-sm text-gray-500 dark:text-gray-400">Jobs Completed</p>
              <p className="text-2xl font-bold">{reportData?.jobsCompleted.length}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
              <p className="text-sm text-gray-500 dark:text-gray-400">Jobs In Progress</p>
              <p className="text-2xl font-bold">{reportData?.jobsInProgress.length}</p>
            </div>
          </div>
        </section>

        {/* Completed Jobs */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Completed Jobs</h2>
          {reportData?.jobsCompleted.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No completed jobs.</p>
          ) : (
            <ul className="space-y-2">
              {reportData!.jobsCompleted.map((job) => (
                <li key={job.id} className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-900 rounded-lg">
                  <span>{job.name}</span>
                  <span className="text-sm">+{job.points} pts</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* In Progress Jobs */}
        <section>
          <h2 className="text-xl font-semibold mb-4">In Progress</h2>
          {reportData?.jobsInProgress.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No jobs in progress.</p>
          ) : (
            <ul className="space-y-2">
              {reportData!.jobsInProgress.map((job) => (
                <li key={job.id} className="flex justify-between items-center p-3 bg-yellow-50 dark:bg-yellow-900 rounded-lg">
                  <span>{job.name}</span>
                  <span className="text-sm">{job.points} pts</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
