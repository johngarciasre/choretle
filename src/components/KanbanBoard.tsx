"use client";

import { useState, useCallback } from "react";
import { Card, Badge } from "@/components/ui";
import { Star, Clock, CheckCircle2, PlayCircle } from "lucide-react";

interface KanbanJob {
  id: string;
  name: string;
  description: string | null;
  points: number;
  status: "todo" | "doing" | "done";
  due_date: string | null;
  slate_name: string | null;
}

interface KanbanBoardProps {
  jobs: KanbanJob[];
  onStatusChange?: (jobId: string, newStatus: string) => void;
}

const COLUMNS: Array<{ key: "todo" | "doing" | "done"; label: string; icon: React.ReactNode }> = [
  { key: "todo", label: "To Do", icon: <Clock size={14} /> },
  { key: "doing", label: "In Progress", icon: <PlayCircle size={14} /> },
  { key: "done", label: "Done", icon: <CheckCircle2 size={14} /> },
];

export default function KanbanBoard({ jobs, onStatusChange }: KanbanBoardProps) {
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const grouped: Record<string, KanbanJob[]> = { todo: [], doing: [], done: [] };
  for (const job of jobs) {
    const status = job.status as "todo" | "doing" | "done";
    if (grouped[status]) grouped[status].push(job);
  }

  const handleDragStart = useCallback((jobId: string) => {
    setDraggedJobId(jobId);
  }, []);

  const handleDrop = useCallback(async (jobId: string, newStatus: string) => {
    if (!draggedJobId || draggedJobId !== jobId) return;
    setDraggedJobId(null);
    setDragOverColumn(null);
    try {
      await fetch(`/api/jobs/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      onStatusChange?.(jobId, newStatus);
    } catch (err) {
      console.error("Failed to update job status:", err);
    }
  }, [draggedJobId, onStatusChange]);

  const totalPoints = jobs.reduce((sum, j) => sum + j.points, 0);

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-4 mb-6">
        <span className="text-sm text-ink/60 font-bold">
          {jobs.filter((j) => j.status === "done").length} completed · {totalPoints} pts available
        </span>
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-3 gap-4 min-h-[320px]">
        {COLUMNS.map((col) => {
          const colJobs = grouped[col.key];
          const isDropTarget = dragOverColumn === col.key;

          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverColumn(col.key);
              }}
              onDragLeave={() => setDragOverColumn(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverColumn(null);
                const jobId = colJobs.find((j) => j.id === draggedJobId)?.id;
                if (jobId) handleDrop(jobId, col.key);
              }}
              className={`rounded-2xl p-4 space-y-3 transition-all ${
                isDropTarget
                  ? "bg-grape/10 ring-2 ring-grape/40"
                  : "bg-white/60"
              }`}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-ink/60">{col.icon}</span>
                <h3 className="font-display text-lg font-bold text-ink capitalize">{col.label}</h3>
                <Badge status={col.key} className="ml-auto text-xs px-2 py-0.5">
                  {colJobs.length}
                </Badge>
              </div>

              {/* Cards */}
              {colJobs.map((job) => (
                <KanbanCard
                  key={job.id}
                  job={job}
                  columnKey={col.key}
                  onDragStart={() => handleDragStart(job.id)}
                />
              ))}

              {/* Empty state */}
              {colJobs.length === 0 && (
                <div className="text-center text-ink/30 text-sm py-8 font-medium">
                  No tasks here
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface KanbanCardProps {
  job: KanbanJob;
  columnKey: string;
  onDragStart: () => void;
}

function KanbanCard({ job, columnKey, onDragStart }: KanbanCardProps) {
  const isOverdue = job.due_date && new Date(job.due_date) < new Date() && columnKey !== "done";

  return (
    <div
      draggable
      onDragStart={() => onDragStart()}
      className={`rounded-xl p-4 cursor-grab active:cursor-grab transition-shadow ${
        columnKey === "todo" ? "bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-md" : ""
      } ${columnKey === "doing" ? "bg-grape/10 ring-1 ring-grape/30" : ""} ${
        columnKey === "done" ? "bg-teal/10 opacity-80" : ""
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-bold text-ink text-sm truncate flex-1">{job.name}</span>
        <Badge status="points" className="text-xs px-2 py-0.5 shrink-0">
          <Star size={8} fill="currentColor" /> {job.points}
        </Badge>
      </div>

      {isOverdue && (
        <Badge status="error" className="text-xs px-2 py-0.5 mt-1">
          Overdue
        </Badge>
      )}

      {job.slate_name && columnKey !== "done" && (
        <span className="text-xs text-ink/40 block mt-1 truncate">{job.slate_name}</span>
      )}

      {columnKey === "done" && job.points > 0 && (
        <div className="flex items-center gap-1 mt-2 text-teal font-bold text-sm">
          <CheckCircle2 size={12} /> +{job.points} pts
        </div>
      )}
    </div>
  );
}
