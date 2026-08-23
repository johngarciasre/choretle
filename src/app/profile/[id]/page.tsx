"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Award, Trophy, TrendingUp, TrendingDown, Flame, Clock, Star, BarChart3, CheckCircle2, ChevronRight } from "lucide-react";

// Server action to fetch profile data
async function fetchUserProfile(userId: string) {
  const res = await fetch(`/api/profile/${userId}`);
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}

interface JobCompletion {
  id: string;
  name: string;
  points: number;
  completedAt: string;
  category: string;
  taskName?: string | null;
}

// ... rest of code

interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: string;
  pointsTotal: number;
  createdAt: string;
}

interface UserStats {
  totalPoints: number;
  pointsThisWeek: number;
  pointsLastWeek: number;
  jobsCompleted: number;
  averagePointsPerJob: number;
  streakDays: number;
  longestStreak: number;
}

export default function UserProfilePage() {
  const params = useParams();
  const userId = typeof params.id === "string" ? params.id : "";

  const [user, setUser] = useState<UserProfile>({
    id: userId,
    name: "Loading...",
    email: "",
    role: "child",
    pointsTotal: 0,
    createdAt: new Date().toISOString(),
  });
  const [stats, setStats] = useState<UserStats>({
    totalPoints: 0,
    pointsThisWeek: 0,
    pointsLastWeek: 0,
    jobsCompleted: 0,
    averagePointsPerJob: 0,
    streakDays: 0,
    longestStreak: 0,
  });
  const [completions, setCompletions] = useState<JobCompletion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/profile/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        setUser(data.user || {});
        setStats(data.stats || stats);
        setCompletions(data.completions || []);
        setLoading(false);
      })
      .catch(() => {
        const mockUser: UserProfile = {
          id: "1",
          name: "Alice",
          email: "alice@choretle.app",
          avatarUrl: "",
          role: "child",
          pointsTotal: 248,
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        };

        const mockStats: UserStats = {
          totalPoints: 248,
          pointsThisWeek: 42,
          pointsLastWeek: 38,
          jobsCompleted: 12,
          averagePointsPerJob: 20.67,
          streakDays: 5,
          longestStreak: 12,
        };

        const mockCompletions: JobCompletion[] = [
          { id: "1", name: "Clean the kitchen", points: 10, completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), category: "Kitchen" },
          { id: "2", name: "Vacuum living room", points: 15, completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), category: "Cleaning" },
          { id: "3", name: "Do dishes", points: 8, completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), category: "Kitchen" },
          { id: "4", name: "Take out trash", points: 5, completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), category: "Chores" },
        ];

        setUser(mockUser);
        setStats(mockStats);
        setCompletions(mockCompletions);
        setLoading(false);
      });
  }, [userId]);

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  const weekTrend = stats.pointsThisWeek - stats.pointsLastWeek;
  const streakFlames = Array.from({ length: Math.min(stats.streakDays, 10) }, () => "\u{1F525}");

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const c of completions) {
      const existing = map.get(c.category) || { total: 0, count: 0 };
      map.set(c.category, { total: existing.total + c.points, count: existing.count + 1 });
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [completions]);

  const last7Days = useMemo(() => {
    const days: { date: string; points: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dayStr = date.toISOString().split("T")[0];
      const pts = completions
        .filter((c) => c.completedAt.startsWith(dayStr))
        .reduce((sum, c) => sum + c.points, 0);
      days.push({ date: dayStr, points: pts });
    }
    return days;
  }, [completions]);

  const maxDayPoints = useMemo(() => Math.max(...last7Days.map((d) => d.points), 1), [last7Days]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center sticky top-0 z-10">
        <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <ChevronRight size={20} className="transform rotate-180" />
          <span className="text-sm text-gray-600 dark:text-gray-300">Back to Dashboard</span>
        </Link>
        <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Profile</h1>
      </nav>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Profile Hero */}
        <div className={cn(
          "rounded-2xl shadow-xl relative overflow-hidden",
          "bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-400 dark:from-indigo-700 dark:via-purple-700 dark:to-pink-600"
        )}>
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_30%_40%,rgba(255,255,255,0.3),transparent_50%)]" />

          {/* Avatar & Name */}
          <div className="relative flex items-center gap-6 p-8">
            {/* Avatar */}
            <div className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold",
              user.avatarUrl ? "" : "bg-gradient-to-br from-indigo-400 to-purple-400"
            )}>
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-full h-full rounded-full object-cover" />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>

            {/* Name & Role */}
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white">{user.name}</h2>
              <p className="text-sm opacity-80 capitalize">{user.role} &middot; Joined {new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</p>
            </div>

            {/* Total Points Badge */}
            <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
              <Award size={20} className="text-yellow-300" />
              <span className="text-xl font-black text-white">{stats.totalPoints.toLocaleString()}</span>
              <span className="text-sm opacity-80 ml-1">pts</span>
            </div>
          </div>

          {/* Streak Bar */}
          {stats.streakDays > 0 && (
            <div className="px-8 pb-6 flex items-center gap-2">
              <Flame size={18} className="text-orange-300" />
              <span className="text-sm font-medium text-white">{stats.streakDays} day streak</span>
              {streakFlames.length > 0 && (
                <span className="text-lg leading-none ml-2">{streakFlames.join("")}</span>
              )}
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Total Points */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5 text-center">
            <Trophy size={20} className="mx-auto mb-3 text-amber-500" />
            <div className="text-2xl font-bold">{stats.totalPoints.toLocaleString()}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total Points</div>
          </div>

          {/* Jobs Completed */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5 text-center">
            <CheckCircle2 size={20} className="mx-auto mb-3 text-emerald-500" />
            <div className="text-2xl font-bold">{stats.jobsCompleted}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Jobs Done</div>
          </div>

          {/* Avg Points / Job */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5 text-center">
            <Star size={20} className="mx-auto mb-3 text-purple-500" />
            <div className="text-2xl font-bold">{stats.averagePointsPerJob.toFixed(1)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Avg / Job</div>
          </div>

          {/* Longest Streak */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5 text-center">
            <Flame size={20} className="mx-auto mb-3 text-orange-500" />
            <div className="text-2xl font-bold">{stats.longestStreak}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Best Streak</div>
          </div>
        </div>

        {/* Weekly Trend */}
        {weekTrend !== 0 && (
          <div className={cn(
            "flex items-center justify-between p-4 rounded-xl border",
            weekTrend > 0 ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800" : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800"
          )}>
            <div className="flex items-center gap-2">
              {weekTrend > 0 ? (
                <TrendingUp size={16} className="text-emerald-500" />
              ) : (
                <TrendingDown size={16} className="text-red-500" />
              )}
              <span className={cn(
                "text-sm font-medium",
                weekTrend > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"
              )}>
                {weekTrend > 0 ? "Up" : "Down"} {Math.abs(weekTrend)} pts vs last week
              </span>
            </div>
          </div>
        )}

        {/* 7-Day Activity Chart */}
        {completions.length > 0 && (
          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={18} className="text-indigo-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">7-Day Activity</h3>
            </div>

            <div className="flex items-end gap-2 h-40">
              {last7Days.map((day, index) => (
                <div key={index} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{day.points > 0 ? `${day.points}pts` : ""}</span>
                  <div className={cn(
                    "w-full rounded-md transition-all duration-300",
                    day.points > 0 ? "bg-gradient-to-t from-indigo-500 to-purple-400" : "bg-gray-200 dark:bg-gray-700"
                  )} style={{ height: `${day.points > 0 ? Math.max((day.points / maxDayPoints) * 100, 8) : 4}%` }} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(day.date).toLocaleDateString("en-US", { weekday: "short" }).charAt(0)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Category Breakdown */}
        {categoryBreakdown.length > 0 && (
          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Star size={18} className="text-purple-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Categories</h3>
            </div>

            <div className="space-y-3">
              {categoryBreakdown.map(([category, data]) => (
                <div key={category} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200 w-24 truncate">{category}</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-400"
                      style={{ width: `${(data.total / stats.totalPoints) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{data.total} pts</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">({data.count})</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Points History Timeline */}
        {completions.length > 0 && (
          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={18} className="text-blue-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Points History</h3>
            </div>

            <div className="space-y-4">
              {completions.slice(0, 8).map((completion, index) => (
                <div key={completion.id} className="flex items-center gap-3">
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center gap-1">
                    <div className={cn(
                      "w-3 h-3 rounded-full border-2",
                      index === 0 ? "bg-indigo-500 border-indigo-500" : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                    )} />
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{completion.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(completion.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      {" · "}
                      {completion.category}
                    </p>
                  </div>

                  {/* Points */}
                  <span className="text-sm font-bold text-amber-500">+{completion.points}</span>
                </div>
              ))}

              {completions.length > 8 && (
                <Link href={`/profile/${userId}/history`} className="flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-400 hover:underline transition-opacity">
                  View all {completions.length} completions
                  <ChevronRight size={14} />
                </Link>
              )}
            </div>
          </section>
        )}

        {/* Badges Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Award size={18} className="text-amber-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Badges</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: "First Task", icon: "\u{1F3AF}", earned: stats.jobsCompleted >= 1, desc: "Complete your first task" },
              { name: "Hard Worker", icon: "\u{1F6BE}", earned: stats.jobsCompleted >= 5, desc: "Complete 5 tasks" },
              { name: "Streak Starter", icon: "\u{1F525}", earned: stats.streakDays >= 3, desc: "3-day streak" },
              { name: "Point Master", icon: "\u{1F3C6}", earned: stats.totalPoints >= 100, desc: "Earn 100 points" },
              { name: "Streak Pro", icon: "\u{1F525}", earned: stats.streakDays >= 7, desc: "7-day streak" },
              { name: "Champion", icon: "\u{1F3C6}", earned: stats.totalPoints >= 500, desc: "Earn 500 points" },
            ].map((badge) => (
              <div key={badge.name} className={cn(
                "flex flex-col items-center gap-2 p-4 rounded-xl text-center transition-shadow",
                badge.earned ? "bg-gradient-to-br from-amber-100 to-yellow-50 dark:from-amber-950 dark:to-yellow-950 border border-amber-300 dark:border-amber-700" : "bg-gray-100 dark:bg-gray-700 opacity-60"
              )}>
                <span className="text-2xl">{badge.earned ? badge.icon : "\u2B50"}</span>
                <span className={cn(
                  "text-sm font-medium",
                  badge.earned ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"
                )}>{badge.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{badge.desc}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

import { useMemo } from "react";