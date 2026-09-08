"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { Badge, Button, EmptyState } from "@/components/ui";
import { StatCard } from "@/components/ui/StatCard";
import {
  ListChecks, Trophy, User, Plus, Trash2, Loader2, ChevronDown,
  Clock, CheckCircle2, AlertCircle, Star, Flame, Target,
} from "lucide-react";
import { error } from "@/lib/logger";

// ─── Types ──────────────────────────────────────────────────────────────

interface ActiveList {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  status: string;
  todo_count: number;
  doing_count: number;
  done_count: number;
  total_jobs: number;
}

interface ParentData {
  activeLists: ActiveList[];
  taskCount: number;
  slateCount: number;
  recentDone: Array<{ name: string; completed_at: string; user_name?: string }>;
}

interface KidOutstandingJob {
  id: string;
  name: string;
  description: string | null;
  points: number;
  status: string;
  due_date: string | null;
  slate_name: string | null;
}

interface KidPendingVerification {
  id: string;
  name: string;
  points: number;
  updated_at: string;
  verification_requested: number;
}

interface KidStats {
  points_total: number;
  weekly_done: number;
  monthly_done: number;
}

interface KidData {
  outstandingJobs: KidOutstandingJob[];
  pendingVerification: KidPendingVerification[];
  recentWins: Array<{ name: string; points: number; date: string }>;
  stats: KidStats | null;
  streakCount: number;
  currentStreak: number;
}

interface DashboardResponse {
  parent: ParentData | null;
  kid: KidData | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
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

// ─── Parent View ────────────────────────────────────────────────────────

function ParentDashboard({ data }: { data: ParentData }) {
  return (
    <div className="space-y-8">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={<ListChecks size={24} />} label="Active Tasks" value={data.taskCount} accent="teal" />
        <StatCard icon={<Trophy size={24} />} label="Slates" value={data.slateCount} accent="grape" />
        <StatCard icon={<CheckCircle2 size={24} />} label="Completed (7d)" value={data.recentDone.length} accent="sunny" />
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Button variant="primary" href="/tasks/new" icon={<Plus size={16} />}>
          New Task
        </Button>
        <Button variant="ghost" href="/slates/new" icon={<Plus size={16} />}>
          New Slate
        </Button>
      </div>

      {/* Active Lists */}
      <section>
        <h2 className="font-display text-xl font-bold text-ink mb-4">Active Task Lists</h2>
        {data.activeLists.length === 0 ? (
          <EmptyState
            icon={<ListChecks size={32} className="text-ink/30" />}
            title="No active lists"
            message="Create tasks and slates, then generate a list to get started."
          />
        ) : (
          <div className="space-y-4">
            {data.activeLists.map((list) => {
              const pct = list.total_jobs > 0 ? Math.round((list.done_count / list.total_jobs) * 100) : 0;
              return (
                <Card key={list.id} accent="teal" className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-display text-lg font-bold text-ink">{list.name}</h3>
                      <span className="text-xs text-ink/50">
                        {formatDate(list.start_date)}{list.end_date ? ` – ${formatDate(list.end_date)}` : ""}
                      </span>
                    </div>
                    <Badge status={pct === 100 ? "done" : pct > 0 ? "doing" : "todo"}>
                      {pct}% complete
                    </Badge>
                  </div>

                  {/* Progress bar */}
                  <div className="bg-ink/10 rounded-full h-3 mb-2 overflow-hidden">
                    <div
                      className="h-3 bg-teal rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Job counts */}
                  <div className="flex gap-4 text-sm font-bold">
                    <span className="text-coral">● {list.todo_count} todo</span>
                    <span className="text-sunny">● {list.doing_count} doing</span>
                    <span className="text-teal">● {list.done_count} done</span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-3 justify-end">
                    <Button variant="ghost" size="sm" href={`/tasks?listId=${list.id}`}>
                      View Jobs
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Completions */}
      {data.recentDone.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold text-ink mb-4">Recent Completions</h2>
          <Card accent="sunny" className="p-5">
            <ul className="space-y-2">
              {data.recentDone.slice(0, 8).map((item, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-ink/80 font-bold">{item.name}</span>
                  <span className="text-ink/40 text-xs">{formatRelative(item.completed_at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}

// ─── Kid View ───────────────────────────────────────────────────────────

function KidDashboard({ data }: { data: KidData }) {
  return (
    <div className="space-y-8">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Star size={20} />} label="Total Points" value={data.stats?.points_total ?? 0} accent="grape" />
        <StatCard icon={<Flame size={20} />} label="Day Streak" value={data.streakCount} accent="coral" />
        <StatCard icon={<CheckCircle2 size={20} />} label="Done (7d)" value={data.stats?.weekly_done ?? 0} accent="teal" />
        <StatCard icon={<Target size={20} />} label="Pending" value={data.outstandingJobs.length} accent="sunny" />
      </div>

      {/* Outstanding Tasks */}
      <section>
        <h2 className="font-display text-xl font-bold text-ink mb-4">Your Tasks</h2>
        {data.outstandingJobs.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={32} className="text-teal/30" />}
            title="All caught up!"
            message="No outstanding tasks. Check back later."
          />
        ) : (
          <div className="space-y-4">
            {data.outstandingJobs.map((job) => {
              const isDoing = job.status === "doing";
              return (
                <Card key={job.id} accent={isDoing ? "grape" : "teal"} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {isDoing && (
                          <Badge status="doing" className="text-xs px-2 py-0.5">In Progress</Badge>
                        )}
                        {!isDoing && job.due_date && (
                          <Badge status={new Date(job.due_date) < new Date() ? "error" : "neutral"} className="text-xs px-2 py-0.5">
                            <Clock size={10} /> Due {formatDate(job.due_date)}
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-display text-lg font-bold text-ink">{job.name}</h3>
                      {job.description && (
                        <p className="text-sm text-ink/60 mt-1 line-clamp-2">{job.description}</p>
                      )}
                      {job.slate_name && (
                        <span className="text-xs text-ink/40 mt-1 block">From: {job.slate_name}</span>
                      )}
                    </div>
                    <Badge status="points" className="shrink-0">
                      <Star size={10} fill="currentColor" /> {job.points}
                    </Badge>
                  </div>

                  {/* Status buttons */}
                  <div className="flex gap-2 mt-3 justify-end">
                    {!isDoing && (
                      <Button variant="grape" size="sm" href={`/jobs/${job.id}`}>
                        Start Task
                      </Button>
                    )}
                    {isDoing && (
                      <Button variant="success" size="sm" href={`/jobs/${job.id}`}>
                        Continue
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Verification Queue */}
      {data.pendingVerification.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold text-ink mb-4 flex items-center gap-2">
            <AlertCircle size={18} className="text-sunny" />
            Needs Verification
          </h2>
          <Card accent="sunny" className="p-5 space-y-3">
            {data.pendingVerification.map((item) => (
              <div key={item.id} className="flex items-center justify-between bg-white rounded-xl p-4 border-2 border-ink/10">
                <div>
                  <p className="font-bold text-ink">{item.name}</p>
                  <span className="text-xs text-ink/50">{formatRelative(item.updated_at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {item.verification_requested === 1 && (
                    <Badge status="warning" className="text-xs px-2 py-0.5">Awaiting parent</Badge>
                  )}
                  <Badge status="points"><Star size={10} fill="currentColor" /> {item.points}</Badge>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* Recent Wins / Badges */}
      {data.recentWins.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold text-ink mb-4 flex items-center gap-2">
            <Star size={18} className="text-sunny" />
            Recent Wins
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.recentWins.map((win, i) => (
              <Card key={i} accent="grape" className="p-4 text-center">
                <Star size={16} className="text-sunny mx-auto mb-2" />
                <p className="font-bold text-ink text-sm">{win.name}</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <Star size={10} fill="currentColor" className="text-grape" />
                  <span className="text-xs text-grape font-bold">{win.points} pts</span>
                </div>
                <span className="text-xs text-ink/40 block mt-1">{formatRelative(win.date)}</span>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Streak Progress */}
      {(data.streakCount > 0 || data.currentStreak > 0) && (
        <section>
          <h2 className="font-display text-xl font-bold text-ink mb-4 flex items-center gap-2">
            <Flame size={18} className="text-coral" />
            Streak Progress
          </h2>
          <Card accent="coral" className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-ink">Current streak: {data.currentStreak} day{data.currentStreak !== 1 ? "s" : ""}</span>
              <span className="text-sm text-ink/60">Best: {data.streakCount}</span>
            </div>
            <div className="bg-coral/20 rounded-full h-4 overflow-hidden">
              <div
                className="h-4 bg-coral rounded-full transition-all"
                style={{ width: `${Math.min(data.currentStreak * 10, 100)}%` }}
              />
            </div>
            <p className="text-xs text-ink/50 mt-2">Keep completing tasks daily to maintain your streak!</p>
          </Card>
        </section>
      )}
    </div>
  );
}

// ─── Page Component ────────────────────────────────────────────────────

async function checkAuthInternal() {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      return data.user;
    } else {
      window.location.href = "/";
      return null;
    }
  } catch (e) {
    error({ err: e }, "Auth check failed");
    window.location.href = "/";
    return null;
  }
}

export default function DashboardPage() {
  const [user, setUser] = useState<{ id: string; email: string; role: string; name: string } | null>(null);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    typeof window !== "undefined" && (document.title = "Choretle - Dashboard");
    Promise.all([checkAuthInternal(), fetch("/api/dashboard", { credentials: "include" }).then((r) => r.json())]).then(([u, d]) => {
      if (u) setUser(u);
      setData(d as DashboardResponse);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <PageShell>
        <main className="flex items-center justify-center min-h-[60vh]">
          <div className="text-ink/60 font-bold flex items-center gap-3">
            <Loader2 size={24} className="animate-spin" /> Loading dashboard...
          </div>
        </main>
      </PageShell>
    );
  }

  if (!user) return null;

  const role = user.role || "child";

  return (
    <PageShell>
      <main className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold text-ink">
              {role === "parent" ? "Parent Dashboard" : `${user.name}'s Dashboard`}
            </h1>
            <p className="text-ink/60 text-sm mt-1">
              {role === "parent"
                ? "Manage tasks, slates, and monitor your family's progress."
                : "Complete chores, earn points, and track your streaks!"}
            </p>
          </div>
        </div>

        {role === "parent" && data?.parent ? (
          <ParentDashboard data={data.parent} />
        ) : role === "child" && data?.kid ? (
          <KidDashboard data={data.kid} />
        ) : (
          <EmptyState
            icon={<User size={32} className="text-ink/30" />}
            title="No data yet"
            message={role === "parent" ? "Create tasks and slates to see your dashboard." : "Start completing tasks to build your streak!"}
          />
        )}

        {/* Quick Links */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card accent="grape" className="flex flex-col items-center text-center p-6">
            <Trophy className="text-grape size-10 mb-4" />
            <h2 className="font-display text-xl font-bold text-ink mb-2">Rotations</h2>
            <Button variant="grape" href="/rotations">View Rotations</Button>
          </Card>
          <Card accent="teal" className="flex flex-col items-center text-center p-6">
            <ListChecks className="text-teal size-10 mb-4" />
            <h2 className="font-display text-xl font-bold text-ink mb-2">Tasks</h2>
            <Button variant="success" href="/tasks">Manage Tasks</Button>
          </Card>
          <Card accent="sunny" className="flex flex-col items-center text-center p-6">
            <User className="text-sunny size-10 mb-4" />
            <h2 className="font-display text-xl font-bold text-ink mb-2">Profile</h2>
            <Button variant="ghost" href={`/profile/${user.id}`}>View Profile</Button>
          </Card>
        </section>
      </main>
    </PageShell>
  );
}
