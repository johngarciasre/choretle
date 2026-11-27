"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PageShell, StatCard, Loading, Badge, Button, Card, PageHeader } from "@/components/ui";
import { Award, Trophy, TrendingUp, TrendingDown, Flame, Clock, Star, BarChart3, CheckCircle2, ChevronRight, Camera } from "lucide-react";
import { getAvatarEmoji } from "@/lib/avatar";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import {
  buildProfileView,
  type ProfileCompletion as JobCompletion,
  type ProfileStats as UserStats,
  type ProfileUser as UserProfile,
} from "@/lib/profile-view";

async function getViewer(): Promise<{ householdId: string; userId: string; role: string }> {
  const authRes = await fetch("/api/auth/me", { credentials: "include" });
  if (!authRes.ok) throw new Error("Not authenticated");
  const authData = await authRes.json();
  const householdId = authData.householdId;
  if (!householdId) throw new Error("No household ID");
  return { householdId, userId: authData.user?.id || "", role: authData.user?.role || "child" };
}

/**
 * Downscale a chosen picture to a 256px square JPEG. There is no file storage,
 * so the photo travels to the API as a data URL — this keeps it small.
 */
async function fileToAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  // Faces usually sit in the upper part of a portrait, so crop closer to the top.
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) * 0.25, side, side, 0, 0, 256, 256);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function UserProfilePage() {
  const authChecked = useAuthRedirect();
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
  const [loadError, setLoadError] = useState(false);
  const [viewerId, setViewerId] = useState("");
  const [viewerRole, setViewerRole] = useState("child");
  // Photo editor: null = closed, otherwise the draft URL.
  const [photoDraft, setPhotoDraft] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [savingPhoto, setSavingPhoto] = useState(false);
  // Captured once when the data arrives so the 7-day chart stays stable across
  // re-renders (reading Date.now() during render is impure).
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") document.title = "Choretle - User Profile";
    getViewer()
      .then((viewer) => {
        setViewerId(viewer.userId);
        setViewerRole(viewer.role);
        return fetch(`/api/profile/${userId}?householdId=${viewer.householdId}`, { credentials: "include" });
      })
      .then((res) => {
        if (!res.ok) throw new Error(`Profile request failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const now = Date.now();
        const view = buildProfileView(data, now);
        setUser(view.user);
        setStats(view.stats);
        setCompletions(view.completions);
        setNowMs(now);
        setLoadError(false);
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
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
    if (!nowMs) return days;
    for (let i = 6; i >= 0; i--) {
      const date = new Date(nowMs - i * 24 * 60 * 60 * 1000);
      const dayStr = date.toISOString().split("T")[0];
      const pts = completions
        .filter((c) => c.completedAt.startsWith(dayStr))
        .reduce((sum, c) => sum + c.points, 0);
      days.push({ date: dayStr, points: pts });
    }
    return days;
  }, [completions, nowMs]);

  const maxDayPoints = useMemo(() => Math.max(...last7Days.map((d) => d.points), 1), [last7Days]);

  const canEditPhoto = viewerId !== "" && (viewerId === userId || viewerRole === "parent");

  async function pickPhotoFile(file: File | undefined) {
    if (!file) return;
    setPhotoError("");
    try {
      setPhotoDraft(await fileToAvatarDataUrl(file));
    } catch {
      setPhotoError("Couldn't read that picture. Try a JPG or PNG.");
    }
  }

  async function savePhoto(next: string | null) {
    setSavingPhoto(true);
    setPhotoError("");
    try {
      const res = await fetch(`/api/profile/${userId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save the photo.");
      setUser((current) => ({ ...current, avatarUrl: data.user?.avatarUrl || undefined }));
      setPhotoDraft(null);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Could not save the photo.");
    } finally {
      setSavingPhoto(false);
    }
  }

  if (!authChecked) return <PageShell><Loading label="Checking authentication..." /></PageShell>;

  if (loading) return <Loading label="Loading profile..." />;

  if (loadError || !user.id) {
    return (
      <PageShell>
        <Card accent="coral" className="mx-auto max-w-md p-8 text-center space-y-4">
          <h2 className="font-display text-2xl font-bold text-ink">Couldn&apos;t load this profile</h2>
          <p className="text-ink/60">The member may have been removed, or you may be offline.</p>
          <Link href="/dashboard">
            <Button variant="ghost">Back to Dashboard</Button>
          </Link>
        </Card>
      </PageShell>
    );
  }

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
            <div className="relative shrink-0">
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold bg-white/90 text-ink shadow-lg">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="w-full h-full rounded-full object-cover object-top" />
                ) : user.id ? (() => {
                    const e = getAvatarEmoji(user.id);
                    return <span className={`${e.bgClass} w-full h-full rounded-full flex items-center justify-center`}>{e.emoji}</span>;
                  })() : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              {canEditPhoto && (
                <button
                  type="button"
                  aria-label="Change profile photo"
                  onClick={() => {
                    setPhotoDraft(user.avatarUrl || "");
                    setPhotoError("");
                  }}
                  className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white text-ink shadow-md flex items-center justify-center hover:bg-cream transition-colors"
                >
                  <Camera size={15} />
                </button>
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

      {photoDraft !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-display text-xl font-bold text-ink mb-1">Profile photo</h3>
            <p className="text-sm text-ink/60 mb-4">Pick a picture of yourself. Only your household can see it.</p>
            {photoDraft && (
              <img
                src={photoDraft}
                alt=""
                className="w-20 h-20 rounded-full object-cover mx-auto mb-4 bg-cream"
              />
            )}
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <label className="px-4 py-2 rounded-full font-bold bg-white text-ink border-2 border-ink/15 hover:border-grape/40 cursor-pointer transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => pickPhotoFile(e.target.files?.[0])}
                  disabled={savingPhoto}
                />
                Choose a file
              </label>
            </div>
            {photoError && <p className="text-sm text-coral mt-2">{photoError}</p>}
            <div className="flex flex-wrap gap-3 justify-end pt-4">
              {user.avatarUrl && (
                <Button variant="ghost" onClick={() => savePhoto(null)} disabled={savingPhoto}>
                  Remove photo
                </Button>
              )}
              <Button variant="ghost" onClick={() => setPhotoDraft(null)} disabled={savingPhoto}>
                Cancel
              </Button>
              <Button onClick={() => savePhoto(photoDraft)} disabled={savingPhoto}>
                {savingPhoto ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
