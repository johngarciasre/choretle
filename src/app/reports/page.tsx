"use client";

import { useEffect, useState } from "react";
import { PageShell, PageHeader, Card, Badge, StatCard, EmptyState, PageLoader, TagPill } from "@/components/ui";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";

type JobStatus = "todo" | "doing" | "done";

interface JobRow {
  id: string;
  name?: string | null;
  task_name?: string | null;
  assigned_name?: string | null;
  assignedTo?: string | null;
  points?: number | null;
  status?: string;
  completed_at?: string | null;
  completedAt?: string | null;
  created_at?: string | null;
}

interface TaskStat {
  taskId: string;
  name?: string;
  total?: number;
  done?: number;
  taskName?: string;
  totalJobs?: number;
  completedJobs?: number;
  completionRate?: number;
}

interface MemberStat {
  userId: string;
  name: string;
  totalPoints?: number;
  totalJobs?: number;
  doneJobs?: number;
}

interface WallboardRow {
  name: string;
  total: number;
}

interface ReportResponse {
  type: string;
  date?: string;
  jobs?: JobRow[];
  stats?: Array<TaskStat | MemberStat>;
  startDate?: string;
  endDate?: string;
  data?: WallboardRow[];
}

type ReportType = "daily" | "done" | "task" | "task_completion" | "member" | "wallboard";

const TABS: Array<{ id: ReportType; label: string }> = [
  { id: "daily", label: "Daily" },
  { id: "done", label: "Done" },
  { id: "task", label: "Tasks" },
  { id: "task_completion", label: "Completion Rate" },
  { id: "member", label: "Members" },
  { id: "wallboard", label: "Wallboard" },
];

const DAY = 24 * 60 * 60 * 1000;

function isoDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
}

function jobLabel(job: JobRow): string {
  return job.task_name || job.name || "Untitled chore";
}

/** Daily/done rows name the assignee; task_completion rows give the raw id. */
function jobPerson(job: JobRow): string | null {
  return job.assigned_name || job.assignedTo || null;
}

/** task_completion rows omit status but only list finished jobs. */
function jobCompletedAt(job: JobRow): string | null {
  return job.completed_at || job.completedAt || null;
}

function isDone(job: JobRow): boolean {
  return job.status ? job.status === "done" : !!jobCompletedAt(job);
}

/** {done, doing, todo} badges only exist for those three workflow states. */
function badgeStatus(status?: string): JobStatus {
  return status === "done" || status === "doing" ? status : "todo";
}

function formatDay(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

export default function ReportsPage() {
  const authChecked = useAuthRedirect();
  const [type, setType] = useState<ReportType>("daily");
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(isoDay(-7));
  const [endDate, setEndDate] = useState(isoDay());

  useEffect(() => {
    if (typeof window !== "undefined") document.title = "Choretle - Reports";
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const params = new URLSearchParams({ type });
        if (type === "task_completion") {
          params.set("startDate", startDate);
          params.set("endDate", endDate);
        }
        const res = await fetch(`/api/reports?${params.toString()}`, { credentials: "include" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Report request failed (${res.status})`);
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Failed to load report");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authChecked, type, startDate, endDate]);

  if (!authChecked) {
    return <PageShell><PageLoader label="Checking authentication..." /></PageShell>;
  }

  // Ignore a previous tab's payload: `stats` means tasks on one tab and members
  // on another, so rendering it under the wrong tab keys rows off missing ids.
  const report = data && data.type === type ? data : null;

  const jobs = report?.jobs ?? [];
  const doneJobs = jobs.filter(isDone);
  const pointsFromJobs = doneJobs.reduce((sum, j) => sum + (j.points ?? 0), 0);

  const taskStats = (type === "task" || type === "task_completion" ? report?.stats ?? [] : []) as TaskStat[];
  const memberStats = (type === "member" ? report?.stats ?? [] : []) as MemberStat[];
  const wallboard = type === "wallboard" ? report?.data ?? [] : [];

  const scheduledTotal = taskStats.reduce((sum, t) => sum + (t.totalJobs ?? t.total ?? 0), 0);
  const scheduledDone = taskStats.reduce((sum, t) => sum + (t.completedJobs ?? t.done ?? 0), 0);
  const memberPoints = memberStats.reduce((sum, m) => sum + (m.totalPoints ?? 0), 0);

  return (
    <PageShell>
      <PageHeader title="Reports" subtitle="View your household's chore progress and achievements" />

      <main className="space-y-8">
        <section>
          <div className="flex flex-wrap gap-3 mb-6">
            {TABS.map((tab) => (
              <TagPill key={tab.id} active={type === tab.id} onClick={() => setType(tab.id)}>
                {tab.label}
              </TagPill>
            ))}
          </div>

          {type === "task_completion" && (
            <div className="flex flex-wrap gap-4 mb-6 items-center">
              <label className="text-sm text-ink/70">
                From:{" "}
                <input
                  type="date"
                  value={startDate}
                  max={endDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="ml-2 px-2 py-1 rounded border border-stone/30 bg-transparent text-sm"
                />
              </label>
              <label className="text-sm text-ink/70">
                To:{" "}
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  max={isoDay()}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="ml-2 px-2 py-1 rounded border border-stone/30 bg-transparent text-sm"
                />
              </label>
            </div>
          )}

          {errorMsg ? (
            <EmptyState
              icon={<span className="text-2xl">⚠️</span>}
              title="Couldn't load this report"
              message={errorMsg}
            />
          ) : loading || !report ? (
            <PageLoader label="Loading report..." />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {type === "member" ? (
                  <>
                    <StatCard icon={<span className="text-xl">👥</span>} label="Members" value={memberStats.length} accent="grape" />
                    <StatCard icon={<span className="text-xl">⭐</span>} label="Points Earned" value={memberPoints} accent="coral" />
                  </>
                ) : type === "wallboard" ? (
                  <StatCard icon={<span className="text-xl">👥</span>} label="Members" value={wallboard.length} accent="teal" />
                ) : type === "task" || type === "task_completion" ? (
                  <>
                    <StatCard icon={<span className="text-xl">📋</span>} label="Jobs Scheduled" value={scheduledTotal} accent="grape" />
                    <StatCard icon={<span className="text-xl">✅</span>} label="Jobs Completed" value={scheduledDone} accent="teal" />
                    {type === "task" ? (
                      <StatCard icon={<span className="text-xl">🗂️</span>} label="Tasks" value={taskStats.length} accent="coral" />
                    ) : (
                      <StatCard icon={<span className="text-xl">⭐</span>} label="Points Earned" value={pointsFromJobs} accent="coral" />
                    )}
                  </>
                ) : (
                  <>
                    <StatCard icon={<span className="text-xl">⭐</span>} label="Points Earned" value={pointsFromJobs} accent="coral" />
                    <StatCard icon={<span className="text-xl">✅</span>} label="Jobs Completed" value={doneJobs.length} accent="teal" />
                    <StatCard icon={<span className="text-xl">🔄</span>} label="In Progress" value={jobs.filter((j) => j.status === "doing").length} accent="sunny" />
                  </>
                )}
              </div>

              {(type === "daily" || type === "done") && (
                <section className="mt-8">
                  <h3 className="font-display text-xl font-bold text-ink mb-4">
                    {type === "daily" ? `Jobs for ${report.date ?? "today"}` : `Completed in the last 7 days`}
                  </h3>
                  {jobs.length === 0 ? (
                    <EmptyState
                      icon={<span className="text-2xl">📋</span>}
                      title={type === "daily" ? "Nothing scheduled" : "Nothing completed yet"}
                      message={type === "daily" ? "No chores are scheduled for this day." : "Finish some chores and they will show up here."}
                    />
                  ) : (
                    <ul className="space-y-2">
                      {jobs.map((job) => (
                        <Card key={job.id} accent={job.status === "done" ? "teal" : "sunny"} className="p-4 flex justify-between items-center gap-4 bg-cream">
                          <div className="min-w-0">
                            <span className="font-bold text-ink">{jobLabel(job)}</span>
                            <span className="ml-2 text-ink/60 text-sm">
                              {jobPerson(job) ? `for ${jobPerson(job)}` : "unassigned"}
                              {type === "done" && jobCompletedAt(job) ? ` · ${formatDay(jobCompletedAt(job))}` : ""}
                            </span>
                          </div>
                          <Badge status={type === "done" ? "done" : badgeStatus(job.status)}>
                            {type === "done" ? `+${job.points ?? 0} pts` : job.status === "done" ? `+${job.points ?? 0} pts` : `${job.points ?? 0} pts`}
                          </Badge>
                        </Card>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {(type === "task" || type === "task_completion") && (
                <section className="mt-8 space-y-6">
                  <h3 className="font-display text-xl font-bold text-ink mb-4">
                    {type === "task"
                      ? "Completion by task"
                      : `Completion Rates (${report.startDate ?? startDate} → ${report.endDate ?? endDate})`}
                  </h3>
                  {taskStats.length === 0 ? (
                    <EmptyState icon={<span className="text-2xl">📋</span>} title="No tasks yet" message="Create some chores to see completion rates." />
                  ) : (
                    <div className="space-y-4">
                      {taskStats.map((s) => {
                        const total = s.totalJobs ?? s.total ?? 0;
                        const done = s.completedJobs ?? s.done ?? 0;
                        const rate = s.completionRate ?? (total > 0 ? Math.round((done / total) * 100) : 0);
                        return (
                          <div key={s.taskId} className="space-y-1.5">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="truncate text-sm font-bold text-ink">{s.taskName || s.name}</span>
                              <span className="shrink-0 flex items-baseline gap-2 text-sm tabular-nums">
                                <span className="text-ink/60">
                                  {done}/{total}
                                </span>
                                <span className="font-bold text-ink">{rate}%</span>
                              </span>
                            </div>
                            <div
                              role="progressbar"
                              aria-label={`${s.taskName || s.name} completion`}
                              aria-valuenow={rate}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              className="h-3 rounded-full bg-ink/10 overflow-hidden"
                            >
                              <div
                                className={`h-full rounded-full transition-all ${
                                  rate >= 75 ? "bg-teal" : rate >= 50 ? "bg-sunny" : "bg-coral"
                                }`}
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {type === "task_completion" && doneJobs.length > 0 && (
                    <div>
                      <h3 className="font-display text-xl font-bold text-ink mb-4 mt-6">Completed Jobs</h3>
                      <ul className="space-y-2">
                        {doneJobs.map((job) => (
                          <Card key={job.id} accent="teal" className="p-4 flex justify-between items-center gap-4 bg-cream">
                            <div className="min-w-0">
                              <span className="font-bold text-ink">{jobLabel(job)}</span>
                              <span className="ml-2 text-ink/60 text-sm">
                                {jobPerson(job) ? `by ${jobPerson(job)}` : "unassigned"}
                                {jobCompletedAt(job) ? ` · ${formatDay(jobCompletedAt(job))}` : ""}
                              </span>
                            </div>
                            <Badge status="done">+{job.points ?? 0} pts</Badge>
                          </Card>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}

              {type === "member" && (
                <section className="mt-8">
                  <h3 className="font-display text-xl font-bold text-ink mb-4">Members</h3>
                  {memberStats.length === 0 ? (
                    <EmptyState icon={<span className="text-2xl">👥</span>} title="No members" message="Invite household members to see their progress." />
                  ) : (
                    <ul className="space-y-2">
                      {memberStats.map((member) => (
                        <Card key={member.userId} accent="teal" className="p-4 flex justify-between items-center gap-4 bg-cream">
                          <div className="min-w-0">
                            <span className="font-bold text-ink">{member.name}</span>
                            <span className="ml-2 text-ink/60 text-sm">
                              {member.doneJobs ?? 0}/{member.totalJobs ?? 0} chores done
                            </span>
                          </div>
                          <Badge status="points">{member.totalPoints ?? 0} pts</Badge>
                        </Card>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {type === "wallboard" && (
                <section className="mt-8">
                  <h3 className="font-display text-xl font-bold text-ink mb-4">Wallboard</h3>
                  {wallboard.length === 0 ? (
                    <EmptyState icon={<span className="text-2xl">📊</span>} title="No leaderboard data" message="Assign some chores to see the wallboard populate." />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {[...wallboard]
                        .sort((a, b) => b.total - a.total)
                        .map((entry) => (
                          <Card key={entry.name} accent="teal" className="text-center">
                            <p className="font-display text-xl font-bold text-ink">{entry.name}</p>
                            <Badge status="points" className="mt-2 mx-auto">{entry.total} chores</Badge>
                          </Card>
                        ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </section>
      </main>
    </PageShell>
  );
}
