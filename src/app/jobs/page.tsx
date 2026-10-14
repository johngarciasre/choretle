"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageShell, Loading } from "@/components/ui";
import { getAvatarEmoji } from "@/lib/avatar";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { Star, CheckCircle2, Clock3, ArrowRight, Trophy, Flame, Sparkles } from "lucide-react";

interface UpcomingJob {
  id: string;
  name: string;
  description: string | null;
  points: number;
  status: "todo" | "doing";
  dueDate: string | null;
  slateName: string | null;
}

interface Completion {
  name: string;
  points: number;
  completedAt: string;
}

interface KanbanData {
  upcoming: UpcomingJob[];
  recentCompletions: Completion[];
  stats: { points_total: number; weekly_done: number };
  streakDays: number;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getAffirmation(completions: Completion[], weeklyDone: number, streakDays: number): string {
  if (streakDays >= 7) return "You're on a 7-day streak — you're unstoppable! 🌟";
  if (streakDays >= 3) return "3 days in a row — you're doing great! 🔪";
  if (weeklyDone >= 5) return "5+ chores this week — amazing work! ⭐";
  if (weeklyDone >= 3) return "Great job tackling chores today! 🌟";
  if (weeklyDone >= 1) return "Nice work finishing a chore! Keep it up! 💪";
  return "Ready to tackle some chores today? You've got this! 🌟";
}

async function fetchKanban(): Promise<KanbanData> {
  const authRes = await fetch("/api/auth/me", { credentials: "include" });
  if (!authRes.ok) throw new Error("Not authenticated");
  const authData = await authRes.json();
  const familyId = authData.familyId;
  if (!familyId) throw new Error("No family ID");

  const res = await fetch(`/api/jobs/kanban?familyId=${familyId}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch kanban data");
  const data = await res.json();

  // Fetch streak days from profile API
  const userId = authData.user?.id || "";
  let streakDays = 0;
  try {
    const profileRes = await fetch(`/api/profile/${userId}?familyId=${familyId}`, { credentials: "include" });
    if (profileRes.ok) {
      const profileData = await profileRes.json();
      streakDays = profileData?.stats?.streakDays || 0;
    }
  } catch {
    // streak days is bonus info, don't fail hard
  }

  return {
    upcoming: data.upcoming || [],
    recentCompletions: data.recentCompletions || [],
    stats: {
      points_total: data.stats?.points_total || 0,
      weekly_done: data.stats?.weekly_done || 0,
    },
    streakDays,
  };
}

export default function JobsPage() {
  const authChecked = useAuthRedirect();
  const [data, setData] = useState<KanbanData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    typeof window !== "undefined" && (document.title = "Choretle - My Chores");
    fetchKanban()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!authChecked) return <PageShell><Loading label="Checking authentication..." /></PageShell>;
  if (loading) return <PageShell><Loading label="Loading your chores..." /></PageShell>;
  if (!data) return <PageShell><Loading label="Something went wrong" /></PageShell>;

  const { upcoming, recentCompletions, stats, streakDays } = data;
  const affirmation = getAffirmation(recentCompletions, stats.weekly_done, streakDays);

  return (
    <PageShell>
      <main className="space-y-8">
        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-grape via-bubblegum to-coral p-8 text-white shadow-xl">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.4),transparent_60%)]" />
          <div className="relative flex items-center justify-between gap-6">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles size={20} className="text-white" />
                <h1 className="font-display text-3xl font-bold">My Chores</h1>
              </div>
              <p className="text-lg font-medium text-white/90">{affirmation}</p>
              <div className="flex items-center gap-6 text-sm font-bold">
                <span className="flex items-center gap-1"><Trophy size={16} /> {stats.points_total.toLocaleString()} pts</span>
                <span className="flex items-center gap-1"><Flame size={16} /> {streakDays} day streak</span>
              </div>
            </div>
            {/* Quick stats pill */}
            <div className="hidden sm:flex flex-col items-center gap-2 rounded-2xl bg-white/20 backdrop-blur-sm p-5">
              <span className="font-display text-4xl font-bold">{stats.weekly_done}</span>
              <span className="text-xs font-bold uppercase tracking-wide text-white/80">This Week</span>
            </div>
          </div>
        </div>

        {/* Recent Completions */}
        {recentCompletions.length > 0 && (
          <section>
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink mb-4">
              <CheckCircle2 size={20} className="text-teal" />
              Recently Completed
            </h2>
            <div className="space-y-3">
              {recentCompletions.slice(0, 5).map((completion, index) => (
                <div key={index} className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      index === 0 ? "bg-teal text-white" : "bg-ink/10 text-ink/50"
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-bold text-ink">{completion.name}</p>
                      <p className="text-xs text-ink/50">{formatRelativeTime(completion.completedAt)}</p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 rounded-lg bg-sunny/20 px-3 py-1 text-sm font-bold text-sunny">
                    <Star size={14} fill="currentColor" />
                    {completion.points} pts
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Upcoming Tasks Carousel */}
        <section>
          <h2 className="flex items-center gap-2 text-xl font-bold text-ink mb-4">
            <Clock3 size={20} className="text-grape" />
            Next Up
          </h2>
          {upcoming.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
              <p className="text-lg font-bold text-ink/60">All caught up! 🎉</p>
              <p className="mt-2 text-sm text-ink/40">No tasks pending — check back later.</p>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
              {upcoming.map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`} className="group shrink-0 w-[280px] rounded-2xl bg-white shadow-sm hover:shadow-lg transition-shadow">
                  <div className={`h-3 rounded-t-2xl ${
                    job.status === "doing"
                      ? "bg-gradient-to-r from-sunny to-coral"
                      : "bg-gradient-to-r from-grape to-bubblegum"
                  }`} />
                  <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      {job.slateName && (
                        <span className="rounded-lg bg-ink/5 px-3 py-1 text-xs font-bold text-ink/60">{job.slateName}</span>
                      )}
                      {job.status === "doing" && (
                        <span className="flex items-center gap-1 rounded-full bg-sunny/20 px-3 py-1 text-xs font-bold text-sunny">
                          <ArrowRight size={12} /> In Progress
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-bold text-ink">{job.name}</h3>
                      {job.description && (
                        <p className="mt-2 text-sm text-ink/60 line-clamp-2">{job.description}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 rounded-lg bg-sunny/20 px-3 py-1.5 text-sm font-bold text-sunny">
                        <Star size={14} fill="currentColor" />
                        {job.points} pts
                      </span>
                      {job.dueDate && (
                        <span className="text-xs text-ink/50">{new Date(job.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </PageShell>
  );
}
