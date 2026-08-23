"use client";

import { useState } from "react";
import Link from "next/link";
import { PageShell, PageHeader, Card, Badge, StatCard, EmptyState, PageLoader } from "@/components/ui";
import { TagPill, Button } from "@/components/ui";

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

  if (!reportData) {
    return <PageLoader label="Loading reports..." />;
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

          {showWallboard && (
            <section className="mb-8">
              <h3 className="font-display text-xl font-bold text-ink mb-4">Wallboard</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { name: "Alice", points: 120, jobsCompleted: 8 },
                  { name: "Bob", points: 95, jobsCompleted: 6 },
                  { name: "Charlie", points: 75, jobsCompleted: 5 },
                ].map((entry) => (
                  <Card key={entry.name} accent="teal" className="text-center">
                    <p className="font-display text-xl font-bold text-ink">{entry.name}</p>
                    <Badge status="points" className="mt-2 mx-auto">{entry.points} pts</Badge>
                    <p className="text-sm text-ink/60 mt-2">{entry.jobsCompleted} jobs done</p>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Summary */}
          {reportData && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard icon={<span className="text-xl">⭐</span>} label="Points Earned" value={reportData.totalPointsEarned} accent="coral" />
              <StatCard icon={<span className="text-xl">✅</span>} label="Jobs Completed" value={reportData.jobsCompleted.length} accent="teal" />
              <StatCard icon={<span className="text-xl">🔄</span>} label="In Progress" value={reportData.jobsInProgress.length} accent="sunny" />
            </div>
          )}

          {/* Completed Jobs */}
          {reportData && reportData.jobsCompleted.length > 0 && (
            <section>
              <h3 className="font-display text-xl font-bold text-ink mb-4">Completed Jobs</h3>
              <ul className="space-y-2">
                {reportData.jobsCompleted.map((job) => (
                  <Card key={job.id} accent="teal" className="p-4 flex justify-between items-center bg-cream">
                    <span className="font-bold text-ink">{job.name}</span>
                    <Badge status="done">+{job.points} pts</Badge>
                  </Card>
                ))}
              </ul>
            </section>
          )}

          {/* In Progress Jobs */}
          {reportData && reportData.jobsInProgress.length > 0 && (
            <section className="mt-8">
              <h3 className="font-display text-xl font-bold text-ink mb-4">In Progress</h3>
              <ul className="space-y-2">
                {reportData.jobsInProgress.map((job) => (
                  <Card key={job.id} accent="sunny" className="p-4 flex justify-between items-center bg-cream">
                    <span className="font-bold text-ink">{job.name}</span>
                    <Badge status="doing">{job.points} pts</Badge>
                  </Card>
                ))}
              </ul>
            </section>
          )}
        </section>
      </main>
    </PageShell>
  );
}
