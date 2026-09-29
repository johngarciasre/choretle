"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PageShell, Badge, Card, EmptyState, PageLoader } from "@/components/ui";
import KanbanBoard from "@/components/KanbanBoard";
import { Flame, Star, Trophy, CheckCircle2, Medal } from "lucide-react";
import { MEDAL_DEFINITIONS } from "@/types/scoring";

interface KanbanJob {
  id: string;
  name: string;
  description: string | null;
  points: number;
  status: "todo" | "doing" | "done";
  due_date: string | null;
  slate_name: string | null;
}

interface RecentCompletion {
  name: string;
  points: number;
  completedAt: string;
}

interface KanbanData {
  jobs: KanbanJob[];
  recentCompletions: RecentCompletion[];
  stats: { points_total: number; weekly_done: number };
}

interface EarnedMedal {
  type: string;
  level: string;
  earnedAt: string | null;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function MyJobsPage() {
  const [data, setData] = useState<KanbanData | null>(null);
  const [medals, setMedals] = useState<EarnedMedal[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    typeof window !== "undefined" && (document.title = "My Chores - Choretle");
  }, []);

  const fetchKanban = useCallback(async () => {
    try {
      const authRes = await fetch("/api/auth/me", { credentials: "include" });
      if (!authRes.ok) throw new Error("Not authenticated");
      const authData = await authRes.json();
      const familyId = authData.familyId;
      if (!familyId) throw new Error("No family ID");

      const res = await fetch(`/api/jobs/kanban?familyId=${familyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch kanban");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Kanban fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [refreshKey]);

  useEffect(() => {
    fetch("/api/medals", { credentials: "include" })
      .then((res) => res.json())
      .then((json) => setMedals(json.medals || []))
      .catch(() => setMedals([]));
  }, [refreshKey]);

  useEffect(() => {
    fetchKanban();
  }, [fetchKanban]);

  const handleStatusChange = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  if (loading) return <PageShell><PageLoader label="Loading your chores..." /></PageShell>;
  if (!data) return <PageShell><EmptyState icon={<span className="text-2xl">📝</span>} title="Couldn't load chores" message="Try refreshing the page." /></PageShell>;

  const completedCount = data.jobs.filter((j) => j.status === "done").length;
  const todoCount = data.jobs.filter((j) => j.status === "todo").length;
  const doingCount = data.jobs.filter((j) => j.status === "doing").length;

  // Badge achievements
  const badges = [
    { name: "First Task", emoji: "\u{1F3AF}", earned: completedCount >= 1, desc: "Complete your first chore" },
    { name: "Hard Worker", emoji: "\u{1F6BE}", earned: completedCount >= 5, desc: "Finish 5 chores" },
    { name: "Point Master", emoji: "\u{1F3C6}", earned: data.stats.points_total >= 100, desc: "Earn 100 points" },
    { name: "Champion", emoji: "\u{1F3C6}", earned: data.stats.points_total >= 500, desc: "Earn 500 points" },
  ];

  return (
    <PageShell>
      <main className="space-y-8">
        {/* Hero */}
        <div className="bg-gradient-to-r from-grape via-bubblegum to-coral rounded-2xl p-6 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.3),transparent_50%)]" />

          <div className="relative flex items-center justify-between">
            <div>
              <h1 className="font-display text-3xl font-bold mb-1">My Chores</h1>
              <p className="text-white/80 text-sm">Drag tasks between columns to track your progress!</p>
            </div>

            {/* Quick stats */}
            <div className="flex gap-4 shrink-0">
              <div className="text-center">
                <div className="flex items-center gap-1 justify-center">
                  <Star size={16} fill="currentColor" />
                  <span className="font-bold text-xl">{data.stats.points_total}</span>
                </div>
                <span className="text-xs text-white/70">Total Points</span>
              </div>
              <div className="text-center">
                <div className="flex items-center gap-1 justify-center">
                  <CheckCircle2 size={16} />
                  <span className="font-bold text-xl">{completedCount}</span>
                </div>
                <span className="text-xs text-white/70">Completed</span>
              </div>
            </div>
          </div>
        </div>

        {/* Kanban Board */}
        <section>
          <h2 className="font-display text-xl font-bold text-ink mb-4 flex items-center gap-2">
            Your Tasks
            {todoCount > 0 && (
              <Badge status="neutral" className="text-xs px-2 py-0.5">
                {todoCount} pending
              </Badge>
            )}
          </h2>

          <KanbanBoard jobs={data.jobs} onStatusChange={handleStatusChange} />
        </section>

        {/* Recent Awards */}
        {data.recentCompletions.length > 0 && (
          <section className="space-y-4">
            <h2 className="font-display text-xl font-bold text-ink mb-2 flex items-center gap-2">
              <Trophy size={18} className="text-sunny" />
              Recent Awards
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.recentCompletions.map((win, i) => (
                <Card key={i} accent="sunny" className="p-4 flex items-center gap-3 bg-white">
                  <div className="w-8 h-8 rounded-full bg-sunny/20 flex items-center justify-center shrink-0">
                    <Star size={16} className="text-sunny" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-ink text-sm truncate">{win.name}</p>
                    <span className="text-xs text-ink/40">{formatRelative(win.completedAt)}</span>
                  </div>
                  <Badge status="points" className="shrink-0 text-xs px-2 py-0.5">
                    +{win.points} pts
                  </Badge>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Badge Achievements */}
        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold text-ink mb-2 flex items-center gap-2">
            <Flame size={18} className="text-coral" />
            Badges
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {badges.map((badge) => (
              <div
                key={badge.name}
                className={`flex flex-col items-center text-center p-5 rounded-xl transition-all ${
                  badge.earned
                    ? "bg-gradient-to-br from-sunny/20 to-coral/20 ring-1 ring-sunny/30"
                    : "bg-white opacity-50"
                }`}
              >
                <span className={`text-3xl mb-2 ${badge.earned ? "" : "grayscale"}`}>
                  {badge.earned ? badge.emoji : "\u2B50"}
                </span>
                <span className={`font-bold text-sm ${badge.earned ? "text-ink" : "text-ink/40"}`}>
                  {badge.name}
                </span>
                <span className="text-xs text-ink/50 mt-1">{badge.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Medal Achievements */}
        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold text-ink mb-2 flex items-center gap-2">
            <Medal size={18} className="text-grape" />
            Medals
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {medals?.map((medal) => {
              const def = MEDAL_DEFINITIONS.find((d) => d.type === medal.type);
              if (!def) return null;
              const isEarned = medal.level !== "none";
              const levelColors: Record<string, string> = {
                bronze: "from-amber-200 to-amber-100 ring-amber/30",
                silver: "from-gray-200 to-gray-100 ring-gray/30",
                gold: "from-yellow-300 to-yellow-100 ring-yellow/40",
                diamond: "from-purple-300 to-pink-300 ring-purple/40",
              };
              const levelEmojis: Record<string, string> = {
                bronze: "\u{1F3AF}",
                silver: "\u{1F3B0}",
                gold: "\u{1F3B1}",
                diamond: "\u{1F48E}",
              };

              return (
                <div
                  key={medal.type}
                  className={`flex flex-col items-center text-center p-5 rounded-xl transition-all ${
                    isEarned
                      ? `bg-gradient-to-br ${levelColors[medal.level]} ring-1`
                      : "bg-white opacity-50"
                  }`}
                >
                  <span className={`text-3xl mb-2 ${isEarned ? "" : "grayscale"}`}>
                    {isEarned ? levelEmojis[medal.level] : "\u2B50"}
                  </span>
                  <span className={`font-bold text-sm ${isEarned ? "text-ink" : "text-ink/40"}`}>
                    {def.name}
                  </span>
                  <span className="text-xs text-ink/50 mt-1">{def.description}</span>
                  {isEarned && (
                    <Badge status={medal.level === "diamond" ? "points" : medal.level === "gold" ? "success" : "neutral"} className="mt-2 text-xs px-2 py-0.5">
                      {medal.level.charAt(0).toUpperCase() + medal.level.slice(1)}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Stats summary */}
        {(doingCount > 0 || completedCount > 0) && (
          <section className="grid grid-cols-3 gap-4">
            {doingCount > 0 && (
              <Card accent="grape" className="p-4 text-center">
                <span className="text-sm text-ink/60 block mb-1">In Progress</span>
                <span className="font-display text-2xl font-bold text-grape">{doingCount}</span>
              </Card>
            )}
            {completedCount > 0 && (
              <Card accent="teal" className="p-4 text-center">
                <span className="text-sm text-ink/60 block mb-1">This Week</span>
                <span className="font-display text-2xl font-bold text-teal">{data.stats.weekly_done}</span>
              </Card>
            )}
            {todoCount > 0 && (
              <Card accent="sunny" className="p-4 text-center">
                <span className="text-sm text-ink/60 block mb-1">Remaining</span>
                <span className="font-display text-2xl font-bold text-sunny">{todoCount}</span>
              </Card>
            )}
          </section>
        )}
      </main>
    </PageShell>
  );
}
