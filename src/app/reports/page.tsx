"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageShell, PageHeader, Card, Badge, StatCard, EmptyState, PageLoader } from "@/components/ui";
import { TagPill, Button } from "@/components/ui";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";

interface ReportData {
  type: string;
  jobsCompleted?: any[];
  jobsInProgress?: any[];
  totalPointsEarned: number;
  members?: any[];
  tasks?: any[];
  totalMembers?: number;
  leaderboard?: any[];
}

type ReportType = "daily" | "done" | "task" | "member";

export default function ReportsPage() {
  const authChecked = useAuthRedirect();
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ReportType>("daily");
  const [showWallboard, setShowWallboard] = useState(false);

  async function fetchReport(type: ReportType) {
    try {
      const authRes = await fetch("/api/auth/me", { credentials: "include" });
      if (!authRes.ok) throw new Error("Not authenticated");
      const authData = await authRes.json();
      const familyId = authData.familyId;

      const res = await fetch(`/api/reports?type=${type}&familyId=${familyId}`, { credentials: "include" });
      if (!res.ok) {
        console.error(`Report fetch failed: ${res.status}`);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setReportData(data);
    } catch (err) {
      console.error("Failed to fetch report:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleTabChange(tab: ReportType) {
    setActiveTab(tab);
    setLoading(true);
    fetchReport(tab).then(() => setLoading(false));
  }

  useEffect(() => {
    typeof window !== "undefined" && (document.title = "Choretle - Reports");
    fetchReport("daily").catch(() => setLoading(false));
  }, []);

  if (!authChecked) return <PageShell><PageLoader label="Checking authentication..." /></PageShell>;

  if (loading) {
    return <PageShell><PageLoader label="Loading reports..." /></PageShell>;
  }

  if (!reportData) {
    return <PageShell><EmptyState icon={<span className="text-2xl">📊</span>} title="No data available" message="There are no reports to display." /></PageShell>;
  }

  return (
    <PageShell>
      <PageHeader title="Reports" subtitle="View your family's chore progress and achievements" />

      <main className="space-y-8">
        {/* Tab Navigation */}
        <section>
          <div className="flex flex-wrap gap-3 mb-6">
            {(["daily", "done", "task", "member"] as ReportType[]).map((tab) => (
              <TagPill
                key={tab}
                active={activeTab === tab}
                onClick={() => handleTabChange(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </TagPill>
            ))}
            <Button variant="grape" onClick={() => setShowWallboard(!showWallboard)}>
              Wallboard
            </Button>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard icon={<span className="text-xl">⭐</span>} label="Points Earned" value={reportData.totalPointsEarned} accent="coral" />
            {reportData.jobsCompleted && (
              <>
                <StatCard icon={<span className="text-xl">✅</span>} label="Jobs Completed" value={reportData.jobsCompleted.length} accent="teal" />
                <StatCard icon={<span className="text-xl">🔄</span>} label="In Progress" value={(reportData.jobsInProgress || []).length} accent="sunny" />
              </>
            )}
          </div>

          {/* Daily Report */}
          {activeTab === "daily" && reportData.jobsInProgress && reportData.jobsInProgress.length > 0 && (
            <section className="mt-8">
              <h3 className="font-display text-xl font-bold text-ink mb-4">In Progress</h3>
              <ul className="space-y-2">
                {reportData.jobsInProgress.map((job: any) => (
                  <Card key={job.job?.id || job.id} accent="sunny" className="p-4 flex justify-between items-center bg-cream">
                    <span className="font-bold text-ink">{job.slateTask?.name || job.task?.name || job.job?.name || "Unknown Task"}</span>
                    <Badge status="doing">{job.job?.points || 0} pts</Badge>
                  </Card>
                ))}
              </ul>
            </section>
          )}

          {/* Done Report */}
          {activeTab === "done" && reportData.jobsCompleted && reportData.jobsCompleted.length > 0 && (
            <section className="mt-8">
              <h3 className="font-display text-xl font-bold text-ink mb-4">Completed Jobs</h3>
              <ul className="space-y-2">
                {reportData.jobsCompleted.map((job: any) => (
                  <Card key={job.id} accent="teal" className="p-4 flex justify-between items-center bg-cream">
                    <span className="font-bold text-ink">{job.name}</span>
                    <Badge status="done">+{job.points} pts</Badge>
                  </Card>
                ))}
              </ul>
            </section>
          )}

          {/* Task Report */}
          {activeTab === "task" && reportData.tasks && reportData.tasks.length > 0 && (
            <section className="mt-8">
              <h3 className="font-display text-xl font-bold text-ink mb-4">Tasks</h3>
              <ul className="space-y-2">
                {reportData.tasks.map((task: any) => (
                  <Card key={task.id} accent="teal" className="p-4 flex justify-between items-center bg-cream">
                    <span className="font-bold text-ink">{task.name}</span>
                    <Badge status="done">{task.completedCount}/{task.totalJobs} done</Badge>
                  </Card>
                ))}
              </ul>
            </section>
          )}

          {/* Member Report */}
          {activeTab === "member" && reportData.members && reportData.members.length > 0 && (
            <section className="mt-8">
              <h3 className="font-display text-xl font-bold text-ink mb-4">Members ({reportData.totalMembers})</h3>
              <ul className="space-y-2">
                {reportData.members.map((member: any) => (
                  <Card key={member.id} accent="teal" className="p-4 flex justify-between items-center bg-cream">
                    <span className="font-bold text-ink">{member.name}</span>
                    <Badge status="points">{member.earnedPoints || member.pointsTotal} pts</Badge>
                  </Card>
                ))}
              </ul>
            </section>
          )}

          {/* Wallboard */}
          {showWallboard && (
            <section className="mt-8">
              <h3 className="font-display text-xl font-bold text-ink mb-4">Wallboard</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {reportData.leaderboard && reportData.leaderboard.length > 0 ? (
                  reportData.leaderboard.map((entry: any) => (
                    <Card key={entry.id} accent="teal" className="text-center">
                      <p className="font-display text-xl font-bold text-ink">{entry.name}</p>
                      <Badge status="points" className="mt-2 mx-auto">{entry.pointsTotal || 0} pts</Badge>
                    </Card>
                  ))
                ) : (
                  <EmptyState icon={<span className="text-2xl">📊</span>} title="No leaderboard data" message="Complete some jobs to see the wallboard populate." />
                )}
              </div>
            </section>
          )}
        </section>
      </main>
    </PageShell>
  );
}
