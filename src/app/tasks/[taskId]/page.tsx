"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell, Card, Badge, EmptyState, PageLoader } from "@/components/ui";
import { TagPill, Button } from "@/components/ui";

interface Task {
  id: string;
  name: string;
  description: string;
  points: number;
  icon?: string;
  archtype?: string;
  isActive?: boolean;
}

interface Tag {
  id: string;
  name: string;
  color?: string;
}

const fetchTask = async (id: string) => {
  try {
    const res = await fetch(`/api/tasks/${id}`);
    if (!res.ok) throw new Error("Failed to fetch task");
    return await res.json();
  } catch (error) {
    console.error("Fetch task failed:", error);
    return null;
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

export default function TaskPage() {
  const router = useRouter();
  const taskId = typeof window !== "undefined" ? new URL(window.location.href).pathname.split("/")[2] : "";
  
  const [task, setTask] = useState<Task | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  useEffect(() => {
    if (!taskId) return;
    Promise.all([fetchTask(taskId), fetchTags()]).then(([taskData, tags]) => {
      if (taskData) {
        setTask(taskData);
        setNameValue(taskData.name);
        setSelectedTagIds(taskData.tagIds || []);
      }
      setTags(tags);
      setLoading(false);
    });
  }, [taskId]);

  async function handleUpdateTask() {
    if (!task || !taskId) return;
    
    try {
      const body = {
        id: task.id,
        name: nameValue,
        description: task.description,
        points: task.points,
        tagIds: selectedTagIds,
      };
      
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Failed to update task");
      
      const updated = await res.json();
      setTask(updated);
      setNameValue(updated.name);
      setSelectedTagIds(updated.tagIds || []);
    } catch (error) {
      console.error("Update task failed:", error);
      alert("Failed to save changes");
    }
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds(prev => 
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  }

  if (loading) return <PageLoader label="Loading task..." />;
  if (!task) return <EmptyState icon={<span className="text-2xl">📋</span>} title="Task not found" message="The task you're looking for doesn't exist." />;

  return (
    <PageShell>
      <Card accent="coral" className="space-y-6">
        {/* Task Details */}
        <section className="space-y-4">
          <div>
            {editingName ? (
              <input
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
                className="w-full px-4 py-2 rounded-xl border-2 border-ink/15 bg-white focus:border-grape focus:outline-none font-bold text-ink"
              />
            ) : (
              <h2 
                className="font-display text-3xl font-bold text-ink cursor-pointer hover:text-grape transition-colors"
                onClick={() => { setEditingName(true); setNameValue(task.name); }}
              >
                {task.name}
              </h2>
            )}
          </div>

          <p className="text-ink/60">{task.description}</p>
          
          <div className="flex items-center gap-6">
            <Badge status="points">{task.points} pts</Badge>
            {task.archtype && (
              <>
                <span className="text-sm text-ink/60">Type:</span>
                <Badge status="neutral" className="text-xs px-2 py-0.5">{task.archtype}</Badge>
              </>
            )}
          </div>

          {/* Tag Editor */}
          <div className="pt-4 border-t border-ink/10">
            <h3 className="font-display text-lg font-bold text-ink mb-3">Tags</h3>
            
            {tags.length === 0 ? (
              <p className="text-sm text-ink/60">No tags available. Create tags in the app settings.</p>
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

            <p className="mt-2 text-sm text-ink/60">
              Select tags to assign to this task. Tags can be used for filtering and auto-inclusion in slates.
            </p>
          </div>
        </section>

        {/* Action Buttons */}
        <section className="flex gap-4 pt-4 border-t border-ink/10">
          {editingName ? (
            <>
              <Button variant="primary" onClick={handleUpdateTask}>
                Save Changes
              </Button>
              <Button variant="ghost" onClick={() => { setEditingName(false); setNameValue(task.name); }}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => { setEditingName(true); setNameValue(task.name); }}>
              Edit Task Details
            </Button>
          )}
          
          <Link href="/tasks" className="px-6 py-2 rounded-full font-bold border-2 border-ink/15 hover:bg-grape/5 hover:border-grape/40 transition-colors text-ink">
            Back to Tasks
          </Link>
        </section>

        {/* Comments Section */}
        <Card accent="teal" className="pt-6 space-y-4">
          <h3 className="font-display text-lg font-bold text-ink">Comments</h3>
          <div className="space-y-3">
            <textarea 
              placeholder="Add a comment..." 
              className="w-full px-4 py-2 rounded-xl border-2 border-ink/15 bg-cream focus:border-grape focus:outline-none font-bold text-ink"
              rows={4}
            />
            <Button variant="primary">
              Post Comment
            </Button>
          </div>
        </Card>
      </Card>
    </PageShell>
  );
}
