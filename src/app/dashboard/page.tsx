"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Award, Trophy, TrendingUp, TrendingDown, Zap, Flame, Clock, Star, Target, BarChart3 } from "lucide-react";
import Leaderboard from "@/components/Leaderboard";
import type { ScoringStats, LeaderboardEntry } from "@/types/scoring";

interface Job {
  id: string;
  name: string;
  status: "todo" | "doing" | "done";
  points: number;
  dueDate: string;
  category?: string;
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [stats, setStats] = useState<ScoringStats>({
    totalPoints: 0,
    pointsThisWeek: 0,
    pointsLastWeek: 0,
    pointsToday: 0,
    averagePerDay: 0,
    jobsCompleted: 0,
    topCategory: "",
    streakDays: 0,
    weeklyGoal: null,
    weeklyProgress: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((data) => {
        setJobs(data.jobs || []);
        setLeaderboard(data.leaderboard || []);
        if (data.stats) setStats(data.stats);
        setLoading(false);
      })
      .catch(() => {
        const now = new Date();
        setJobs([
          { id: "1", name: "Clean the kitchen", status: "todo", points: 10, dueDate: now.toISOString(), category: "Kitchen" },
          { id: "2", name: "Take out the trash", status: "doing", points: 5, dueDate: now.toISOString(), category: "Chores" },
          { id: "3", name: "Vacuum the living room", status: "todo", points: 15, dueDate: now.toISOString(), category: "Cleaning" },
          { id: "4", name: "Do the dishes", status: "done", points: 8, dueDate: now.toISOString(), category: "Kitchen" },
        ]);

        setLeaderboard([
          { userId: "1", name: "Alice", totalPoints: 120, role: "child", jobsCompleted: 8, streakDays: 3, trend: "up" as const, trendValue: 15, pointsThisWeek: 45 },
          { userId: "2", name: "Bob", totalPoints: 95, role: "child", jobsCompleted: 6, streakDays: 1, trend: "down" as const, trendValue: -3, pointsThisWeek: 30 },
          { userId: "3", name: "Charlie", totalPoints: 75, role: "child", jobsCompleted: 5, streakDays: 0, trend: "flat" as const, trendValue: 0, pointsThisWeek: 38 },
        ]);

        setStats({
          totalPoints: 248,
          pointsThisWeek: 42,
          pointsLastWeek: 38,
          pointsToday: 8,
          averagePerDay: 6,
          jobsCompleted: 12,
          topCategory: "Cleaning",
          streakDays: 5,
          weeklyGoal: 50,
          weeklyProgress: 84,
        });

        setLoading(false);
      });
  }, []);

  const openJobs = useMemo(() => jobs.filter((j) => j.status !== "done"), [jobs]);
  const completedJobs = useMemo(() => jobs.filter((j) => j.status === "done").slice(0, 5), [jobs]);

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  const weekTrend = stats.pointsThisWeek - stats.pointsLastWeek;
  const weekTrendPercent = stats.pointsLastWeek > 0 ? Math.round((weekTrend / stats.pointsLastWeek) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Choretle</h1>
        <div className="flex items-center gap-4">
          {/* Points Badge */}
          <div className="flex items-center gap-2 bg-gradient-to-r from-amber-400 to-yellow-300 dark:from-amber-600 dark:to-yellow-500 px-3 py-1.5 rounded-full shadow-md">
            <Award size={18} className="text-white drop-shadow" />
            <span className="text-sm font-bold text-white">{stats.totalPoints.toLocaleString()}</span>
          </div>
          <Link href="/tasks" className="hover:underline text-sm">Tasks</Link>
          <Link href="/reports" className="hover:underline text-sm">Reports</Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Scoring Hero Card */}
        <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-400 dark:from-indigo-700 dark:via-purple-700 dark:to-pink-600 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_30%_40%,rgba(255,255,255,0.3),transparent_50%)]" />
          <div className="relative grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
            {/* Total Points */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2 opacity-90">
                <Trophy size={16} />
                <span className="text-xs font-medium uppercase tracking-wide">Total Points</span>
              </div>
              <div className="text-4xl font-black text-white drop-shadow">{stats.totalPoints.toLocaleString()}</div>
            </div>

            {/* This Week */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2 opacity-90">
                <BarChart3 size={16} />
                <span className="text-xs font-medium uppercase tracking-wide">This Week</span>
              </div>
              <div className="text-2xl font-bold">{stats.pointsThisWeek}</div>
              {weekTrend !== 0 && (
                <div className={cn(
                  "flex items-center justify-center gap-1 mt-1 text-sm",
                  weekTrend > 0 ? "text-emerald-300" : "text-red-300"
                )}>
                  {weekTrend > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  <span>{Math.abs(weekTrendPercent)}%</span>
                </div>
              )}
            </div>

            {/* Streak */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2 opacity-90">
                <Flame size={16} />
                <span className="text-xs font-medium uppercase tracking-wide">Streak</span>
              </div>
              <div className="text-2xl font-bold">{stats.streakDays}</div>
              <span className="text-xs opacity-75">days</span>
            </div>

            {/* Jobs Completed */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2 opacity-90">
                <Zap size={16} />
                <span className="text-xs font-medium uppercase tracking-wide">Completed</span>
              </div>
              <div className="text-2xl font-bold">{stats.jobsCompleted}</div>
              <span className="text-xs opacity-75">jobs this week</span>
            </div>
          </div>

          {/* Weekly Goal Progress */}
          {stats.weeklyGoal && (
            <div className="mt-6 pt-4 border-t border-white/20">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-1.5 text-xs font-medium opacity-90">
                  <Target size={14} />
                  Weekly Goal Progress
                </div>
                <span className="text-sm font-bold">{stats.weeklyProgress}%</span>
              </div>
              <div className="h-3 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-400 transition-all duration-700 ease-out"
                  style={{ width: `${stats.weeklyProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Points Today */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border-l-4 border-indigo-500 dark:border-indigo-600">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-indigo-500" />
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Points Today</span>
            </div>
            <div className="text-2xl font-bold">{stats.pointsToday}</div>
          </div>

          {/* Average Per Day */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border-l-4 border-emerald-500 dark:border-emerald-600">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={16} className="text-emerald-500" />
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Avg / Day</span>
            </div>
            <div className="text-2xl font-bold">{stats.averagePerDay}</div>
          </div>

          {/* Top Category */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border-l-4 border-purple-500 dark:border-purple-600">
            <div className="flex items-center gap-2 mb-3">
              <Star size={16} className="text-purple-500" />
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Top Category</span>
            </div>
            <div className="text-lg font-bold">{stats.topCategory || "—"}</div>
            {stats.pointsThisWeek > 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                earned {stats.pointsThisWeek} pts this week
              </div>
            )}
          </div>
        </div>

        {/* Outstanding Jobs */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Outstanding Jobs Today</h2>
          {openJobs.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No outstanding jobs. Great job!</p>
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
                  <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">+{job.points} pts</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Leaderboard */}
        <section>
          <Leaderboard entries={leaderboard} currentUserId="1" />
        </section>
      </main>
    </div>
  );
}
