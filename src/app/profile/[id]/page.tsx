"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PageShell, StatCard, Loading, Badge, Button, Card, PageHeader } from "@/components/ui";
import { Award, Trophy, TrendingUp, TrendingDown, Flame, Clock, Star, BarChart3, CheckCircle2, ChevronRight } from "lucide-react";
import { getAvatarEmoji } from "@/lib/avatar";

interface JobCompletion {
  id: string;
  name: string;
  points: number;
  completedAt: string;
  category: string;
  taskName?: string | null;
}

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
    typeof window !== "undefined" && (document.title = "Choretle - User Profile");
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

  if (loading) return <Loading label="Loading profile..." />;

  const weekTrend = stats.pointsThisWeek - stats.pointsLastWeek;
  const streakFlames = Array.from({ length: Math.min(stats.streakDays, 10) }, () => "\u{1F525}");

  return (
    <PageShell>
      <PageHeader 
        title={user.name}
        subtitle={`${user.role} \u00B7 Joined ${new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`}
        actions={
          <Link href="/dashboard">
            <Button variant="ghost">Back to Dashboard</Button>
          </Link>
        }
      />

      <main className="space-y-6">
        {/* Profile Hero - Candy Gradient */}
        <div className="bg-gradient-to-br from-coral via-bubblegum to-grape rounded-2xl shadow-xl relative overflow-hidden p-8 text-white">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_30%_40%,rgba(255,255,255,0.3),transparent_50%)]" />

          {/* Avatar & Name */}
          <div className="relative flex items-center gap-6">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold bg-white/90 text-ink shadow-lg">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-full h-full rounded-full object-cover" />
              ) : user.id ? (() => {
                  const e = getAvatarEmoji(user.id);
                  return <span className={`${e.bgClass} w-full h-full rounded-full flex items-center justify-center`}>{e.emoji}</span>;
                })() : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>

            {/* Name & Role */}
            <div className="flex-1">
              <h2 className="font-display text-4xl font-bold">{user.name}</h2>
              <p className="text-white/80 capitalize">{user.role}</p>
            </div>

            {/* Total Points Badge */}
            <Badge status="points" className="text-lg px-5 py-2">
              <Star size={16} fill="currentColor" />
              {stats.totalPoints.toLocaleString()} pts
            </Badge>
          </div>

          {/* Streak Bar */}
          {stats.streakDays > 0 && (
            <div className="mt-6 flex items-center gap-3">
              <Flame size={20} />
              <span className="text-lg font-bold">{stats.streakDays} day streak</span>
              {streakFlames.length > 0 && (
                <span className="text-2xl leading-none ml-1">{streakFlames.join("")}</span>
              )}
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Points */}
          <StatCard 
            icon={<Trophy size={24} />}
            label="Total Points"
            value={stats.totalPoints.toLocaleString()}
            accent="coral"
          />

          {/* Jobs Completed */}
          <StatCard 
            icon={<CheckCircle2 size={24} />}
            label="Jobs Done"
            value={stats.jobsCompleted}
            accent="teal"
          />

          {/* Avg Points / Job */}
          <StatCard 
            icon={<Star size={24} />}
            label="Avg / Job"
            value={stats.averagePointsPerJob.toFixed(1)}
            accent="sunny"
          />

          {/* Longest Streak */}
          <StatCard 
            icon={<Flame size={24} />}
            label="Best Streak"
            value={stats.longestStreak}
            accent="grape"
          />
        </div>

        {/* Weekly Trend */}
        {weekTrend !== 0 && (
          <Card accent={weekTrend > 0 ? "teal" : "grape"} className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {weekTrend > 0 ? (
                <TrendingUp size={18} />
              ) : (
                <TrendingDown size={18} />
              )}
              <span className="font-bold text-ink">
                {weekTrend > 0 ? "Up" : "Down"} {Math.abs(weekTrend)} pts vs last week
              </span>
            </div>
          </Card>
        )}

        {/* 7-Day Activity Chart */}
        {completions.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 size={20} className="text-sunny" />
              <h3 className="font-display text-xl font-bold text-ink">7-Day Activity</h3>
            </div>

            <Card accent="sunny" className="p-6">
              <div className="flex items-end gap-2 h-48">
                {last7Days.map((day, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs font-bold text-ink/60">{day.points > 0 ? `${day.points}pts` : ""}</span>
                    <div 
                      className={`w-full rounded-t-xl transition-all duration-300 ${
                        day.points > 0 ? "bg-gradient-to-t from-teal to-sunny" : "bg-ink/10"
                      }`} 
                      style={{ height: `${day.points > 0 ? Math.max((day.points / maxDayPoints) * 100, 8) : 4}%` }} 
                    />
                    <span className="text-xs text-ink/60">
                      {new Date(day.date).toLocaleDateString("en-US", { weekday: "short" }).charAt(0)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </section>
        )}

        {/* Category Breakdown */}
        {categoryBreakdown.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Star size={20} className="text-grape" />
              <h3 className="font-display text-xl font-bold text-ink">Categories</h3>
            </div>

            <Card accent="bubblegum" className="p-6">
              <div className="space-y-4">
                {categoryBreakdown.map(([category, data]) => (
                  <div key={category} className="flex items-center gap-4">
                    <span className="text-sm font-bold text-ink w-32 truncate">{category}</span>
                    <div className="flex-1 h-3 rounded-full bg-ink/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-grape to-bubblegum"
                        style={{ width: `${(data.total / stats.totalPoints) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-ink">{data.total} pts</span>
                    <span className="text-xs text-ink/60">({data.count})</span>
                  </div>
                ))}
              </div>
            </Card>
          </section>
        )}

        {/* Points History Timeline */}
        {completions.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={20} className="text-teal" />
              <h3 className="font-display text-xl font-bold text-ink">Points History</h3>
            </div>

            <Card accent="teal" className="p-6">
              <div className="space-y-4">
                {completions.slice(0, 8).map((completion, index) => (
                  <div key={completion.id} className="flex items-center gap-3">
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-3 h-3 rounded-full border-2 ${
                        index === 0 
                          ? "bg-coral border-coral" 
                           : "bg-white border-teal/30"
                      }`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <p className="text-sm font-bold text-ink">{completion.name}</p>
                      <p className="text-xs text-ink/60">
                        {new Date(completion.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {" \u00B7 "}
                        {completion.category}
                      </p>
                    </div>

                    {/* Points */}
                    <Badge status="points">
                      +{completion.points} pts
                    </Badge>
                  </div>
                ))}

                {completions.length > 8 && (
                  <Link href={`/profile/${userId}/history`} className="flex items-center gap-1 text-sm text-grape hover:underline transition-opacity">
                    View all {completions.length} completions
                    <ChevronRight size={14} />
                  </Link>
                )}
              </div>
            </Card>
          </section>
        )}

        {/* Badges/achievements Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Award size={20} className="text-bubblegum" />
            <h3 className="font-display text-xl font-bold text-ink">Badges</h3>
          </div>

          <Card accent="sunny" className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
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
                  badge.earned 
                    ? "bg-sunny text-ink shadow-md shadow-sunny/30" 
                    : "bg-ink/5 opacity-60"
                )}>
                  <span className="text-2xl">{badge.earned ? badge.icon : "\u2B50"}</span>
                  <span className={`text-sm font-bold ${
                      badge.earned ? "text-ink" : "text-ink/40"
                  }`}>{badge.name}</span>
                  <span className="text-xs text-ink/60">{badge.desc}</span>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </main>
    </PageShell>
  );
}
