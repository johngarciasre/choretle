"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageShell, PageHeader, EmptyState, Badge, PageLoader, Card } from "@/components/ui";
import { TagPill } from "@/components/ui";

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

const fetchTasks = async (tagFilter?: string[]) => {
  try {
    const filter = tagFilter ? `?tagIds=${encodeURIComponent(JSON.stringify(tagFilter))}` : "";
    const res = await fetch(`/api/tasks${filter}`);
    if (!res.ok) throw new Error("Failed to fetch tasks");
    return await res.json();
  } catch (error) {
    console.error("Fetch tasks failed:", error);
    return [];
  }
};

const fetchTags = async () => {
  try {
    const res = await fetch("/api/tags?familyId=test-family");
    if (!res.ok) throw new Error("Failed to fetch tags");
    return await res.json();
  } catch (error) {
    console.error("Fetch tags failed:", error);
    return [];
  }
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([fetchTasks(), fetchTags()]).then(([tasks, tags]) => {
      setTasks(tasks);
      setTags(tags);
      setLoading(false);
    });
  }, []);

  function toggleTag(tagId: string) {
    setSelectedTagIds(prev => 
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  }

  if (loading) return <PageLoader label="Loading tasks..." />;

  return (
    <PageShell>
      <PageHeader title="Tasks" subtitle="Browse and manage all available tasks for your family" />

      <main className="space-y-8">
        {/* Tag Filter */}
        <section>
          <Card accent="coral" className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="font-display text-lg font-bold text-ink">Filter by Tags</h3>
            </div>

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

            {(selectedTagIds.length === 0 && tags.length > 0) && (
              <p className="mt-2 text-sm text-ink/60">
                Select one or more tags to filter tasks.
              </p>
            )}
          </Card>
        </section>

        {/* Tasks Grid */}
        <section>
          <h2 className="font-display text-xl font-bold text-ink mb-4">Tasks {selectedTagIds.length > 0 && `(filtered: ${selectedTagIds.length})`}</h2>
          {tasks.length === 0 ? (
            <EmptyState icon={<span className="text-2xl">📋</span>} title="No tasks found" message="Complete all jobs to create tasks!" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tasks.map((task) => (
                <Link key={task.id} href={`/tasks/${task.id}`} className="block bg-white rounded-2xl shadow-[0_8px_30px_rgba(59,47,99,0.08)] p-6 hover:shadow-lg transition-shadow">
                  <h3 className="font-display text-lg font-bold text-ink">{task.name}</h3>
                  <p className="text-sm text-ink/60 mt-2">{task.description}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <Badge status="points">{task.points} pts</Badge>
                    {task.tagIds && task.tagIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {task.tagIds.map(tagId => {
                          const tag = tags.find(t => t.id === tagId);
                          return tag ? (
                            <Badge key={tag.id} status="neutral" className="text-xs px-2 py-0.5">{tag.name}</Badge>
                          ) : null;
                        })}
                      </div>
                    )}
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
