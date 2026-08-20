"use client";

import { useState } from "react";
import Link from "next/link";

interface ReportData {
  type: string;
  jobsCompleted: any[];
  jobsInProgress: any[];
  totalPointsEarned: number;
}

type ReportType = "daily" | "done" | "task" | "member";

export default function ReportsPage() {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [activeTab, setActiveTab] = useState<ReportType>("daily");
  const [showWallboard, setShowWallboard] = useState(false);

  // Mock data
  const mockData: Record<string, ReportData> = {
    daily: {
      type: "daily",
      jobsCompleted: [
        { id: "1", name: "Clean the kitchen", points: 10 },
        { id: "2", name: "Take out the trash", points: 5 },
      ],
      jobsInProgress: [{ id: "3", name: "Vacuum the living room", points: 15 }],
      totalPointsEarned: 30,
    },
    done: {
      type: "done",
      jobsCompleted: [
        { id: "4", name: "Do dishes", points: 8 },
        { id: "5", name: "Make bed", points: 3 },
      ],
      jobsInProgress: [],
      totalPointsEarned: 11,
    },
    task: {
      type: "task",
      jobsCompleted: [{ id: "6", name: "Clean bathroom", points: 12 }],
      jobsInProgress: [],
      totalPointsEarned: 12,
    },
    member: {
      type: "member",
      jobsCompleted: [
        { id: "7", name: "Walk dog", points: 5 },
        { id: "8", name: "Feed cat", points: 3 },
      ],
      jobsInProgress: [],
      totalPointsEarned: 8,
    },
  };

  function handleTabChange(tab: ReportType) {
    setActiveTab(tab);
    setReportData(mockData[tab]);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Choretle</h1>
        <div className="flex gap-4">
          <Link href="/dashboard" className="hover:underline">Dashboard</Link>
          <Link href="/reports" className="hover:underline text-indigo-600 font-semibold">Reports</Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Tab Navigation */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Reports</h2>
          <div className="flex gap-2 mb-4">
            {(["daily", "done", "task", "member"] as ReportType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`px-4 py-2 rounded-lg ${activeTab === tab ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-700"}`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
            <button
              onClick={() => setShowWallboard(!showWallboard)}
              className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700"
            >
              Wallboard
            </button>
          </div>

          {showWallboard && (
            <section className="mb-8">
              <h3 className="text-lg font-semibold mb-2">Wallboard</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { name: "Alice", points: 120, jobsCompleted: 8 },
                  { name: "Bob", points: 95, jobsCompleted: 6 },
                  { name: "Charlie", points: 75, jobsCompleted: 5 },
                ].map((entry) => (
                  <div key={entry.name} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm text-center">
                    <p className="font-bold">{entry.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{entry.points} pts</p>
                    <p className="text-xs">{entry.jobsCompleted} jobs done</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Summary */}
          {reportData && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                <p className="text-sm text-gray-500 dark:text-gray-400">Points Earned</p>
                <p className="text-2xl font-bold">{reportData.totalPointsEarned}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                <p className="text-sm text-gray-500 dark:text-gray-400">Jobs Completed</p>
                <p className="text-2xl font-bold">{reportData.jobsCompleted.length}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                <p className="text-sm text-gray-500 dark:text-gray-400">Jobs In Progress</p>
                <p className="text-2xl font-bold">{reportData.jobsInProgress.length}</p>
              </div>
            </div>
          )}

          {/* Completed Jobs */}
          {reportData && reportData.jobsCompleted.length > 0 && (
            <section>
              <h3 className="text-lg font-semibold mb-2">Completed Jobs</h3>
              <ul className="space-y-2">
                {reportData.jobsCompleted.map((job) => (
                  <li key={job.id} className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-900 rounded-lg">
                    <span>{job.name}</span>
                    <span className="text-sm">+{job.points} pts</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* In Progress Jobs */}
          {reportData && reportData.jobsInProgress.length > 0 && (
            <section className="mt-8">
              <h3 className="text-lg font-semibold mb-2">In Progress</h3>
              <ul className="space-y-2">
                {reportData.jobsInProgress.map((job) => (
                  <li key={job.id} className="flex justify-between items-center p-3 bg-yellow-50 dark:bg-yellow-900 rounded-lg">
                    <span>{job.name}</span>
                    <span className="text-sm">{job.points} pts</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}
