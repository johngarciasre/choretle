"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageShell, PageHeader, EmptyState, PageLoader, Card, Badge } from "@/components/ui";
import { TagPill } from "@/components/ui";
import { error } from "@/lib/logger";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { ThemeProvider } from "@/lib/theme";
import { useFamilyTheme } from "@/lib/use-family-theme";

interface Task {
  id: string;
  name: string;
  description: string;
  points: number;
  tagIds?: string[];
}

interface Tag {
  id: string;
  name: string;
  color?: string;
}

async function getFamilyId(): Promise<string> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (!res.ok) throw new Error("Not authenticated");
  const data = await res.json();
  if (data.authenticated === false) throw new Error("Not authenticated");
  if (!data.familyId) throw new Error(data.authenticated ? "No family ID" : "Not authenticated");
  return data.familyId;
}

const fetchTasks = async () => {
  const fid = await getFamilyId();
  const res = await fetch(`/api/tasks?familyId=${fid}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch tasks");
  return await res.json();
};

const fetchTags = async () => {
  const fid = await getFamilyId();
  const res = await fetch(`/api/tags?familyId=${fid}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch tags");
  return await res.json();
};

export default function TasksPage() {
  const authChecked = useAuthRedirect();
  const familyTheme = useFamilyTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  useEffect(() => {
    typeof window !== "undefined" && (document.title = "Choretle - Tasks");
    Promise.all([fetchTasks(), fetchTags()]).then(([tasksData, tagsData]) => {
      setTasks(tasksData || []);
      setTags(tagsData || []);
      setLoading(false);
    });
  }, []);

  function toggleTag(tagId: string) {
    setSelectedTagIds(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  }

  const filteredTasks = selectedTagIds.length === 0
    ? tasks
    : tasks.filter(t => t.tagIds && t.tagIds.some(tid => selectedTagIds.includes(tid)));

  if (!authChecked) return <ThemeProvider familyTheme={familyTheme}><PageShell><PageLoader label="Checking authentication..." /></PageShell></ThemeProvider>;
  if (loading) return <ThemeProvider familyTheme={familyTheme}><PageShell><PageLoader label="Loading tasks..." /></PageShell></ThemeProvider>;

  return (
    <ThemeProvider familyTheme={familyTheme}>
      <PageShell>
      <PageHeader
        title="Tasks"
        subtitle="Browse and manage all available tasks for your family"
      />

      <div className="relative space-y-8 pb-16">
        {/* Tag Filter */}
        <section>
          <Card accent="coral" className="p-4">
            <h3 className="font-display text-lg font-bold text-ink mb-4">Filter by Tags</h3>

            {tags.length === 0 ? (
              <p className="text-sm text-ink/60">No tags available.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <TagPill
                    key={tag.id}
                    active={selectedTagIds.includes(tag.id)}
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                  </TagPill>
                ))}
              </div>
            )}

            {selectedTagIds.length > 0 && (
              <button
                onClick={() => setSelectedTagIds([])}
                className="mt-3 text-sm font-medium text-grape hover:underline"
              >
                Clear filter
              </button>
            )}
          </Card>
        </section>

        {/* Tasks Grid */}
        <section>
          <h2 className="font-display text-xl font-bold text-ink mb-4">
            {selectedTagIds.length > 0
              ? `Tasks (${filteredTasks.length} of ${tasks.length})`
              : "All Tasks"}
          </h2>

          {filteredTasks.length === 0 ? (
            <EmptyState
              icon={<span className="text-2xl">📋</span>}
              title={selectedTagIds.length > 0 ? "No tasks match the selected tags" : "No tasks found"}
              message={selectedTagIds.length > 0 ? "Try selecting different tags" : "Create a task to get started!"}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTasks.map((task) => (
                <Link key={task.id} href={`/tasks/${task.id}`} className="block group">
                  <Card accent="teal" className="p-6 space-y-4 hover:brightness-105 transition-all">
                    <h3 className="font-display text-lg font-bold text-ink pr-4">{task.name}</h3>
                    {task.description && (
                      <p className="text-sm text-ink/60 mt-2 line-clamp-2">{task.description}</p>
                    )}

                    <div className="mt-2 flex items-center gap-2">
                      <Badge status="points">{task.points} pts</Badge>
                      {task.tagIds && task.tagIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {task.tagIds.map(tagId => {
                            const tag = tags.find(t => t.id === tagId);
                            return tag ? (
                              <span key={tag.id} className="rounded-full px-3 py-1.5 text-sm font-bold bg-white text-ink border-2 border-ink/10">{tag.name}</span>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Create Task Button */}
        <div className="flex justify-end">
          <Link href="/tasks/new" className="px-6 py-2 rounded-full font-bold bg-coral text-white hover:brightness-105 transition-all shadow-md shadow-coral/30 inline-flex items-center gap-2">
            <span>Create Task</span>
          </Link>
        </div>
      </div>
      </PageShell>
    </ThemeProvider>
  );
}
