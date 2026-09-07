"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageShell, Card, Badge, PageLoader } from "@/components/ui";
import { TagPill, Button } from "@/components/ui";
import { X } from "lucide-react";
import { error } from "@/lib/logger";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { ThemeProvider } from "@/lib/theme";
import { useFamilyTheme } from "@/lib/use-family-theme";

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

const fetchTags = async () => {
  const fid = await getFamilyId();
  const res = await fetch(`/api/tags?familyId=${fid}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch tags");
  return await res.json();
};

export default function NewTaskPage() {
  const authChecked = useAuthRedirect();
  const familyTheme = useFamilyTheme();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    points: 10,
    tagIds: [] as string[],
  });

  useEffect(() => {
    typeof window !== "undefined" && (document.title = "Choretle - New Task");
    Promise.all([fetchTags()]).then(([tagsData]) => {
      setTags(tagsData || []);
      setLoading(false);
    });
  }, []);

  async function handleCreateTask() {
    if (!formData.name.trim()) return;

    try {
      const familyId = await getFamilyId();

      const res = await fetch(`/api/tasks?familyId=${familyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          points: formData.points,
          tags: formData.tagIds,
        }),
      });

      if (!res.ok) throw new Error("Failed to create task");

      const data = await res.json();
      window.location.href = `/tasks/${data.id}`;
    } catch (err) {
      error({ err: err }, "Create task failed");
      alert("Failed to create task");
    }
  }

  if (!authChecked) return <ThemeProvider familyTheme={familyTheme}><PageShell><PageLoader label="Checking authentication..." /></PageShell></ThemeProvider>;
  if (loading) return <ThemeProvider familyTheme={familyTheme}><PageShell><PageLoader label="Loading..." /></PageShell></ThemeProvider>;

  return (
    <ThemeProvider familyTheme={familyTheme}>
      <PageShell>
      <div className="max-w-md mx-auto space-y-6">
        <h1 className="font-display text-3xl font-bold text-ink">Create New Task</h1>

        <Card accent="coral" className="space-y-4">
          <div>
            <label htmlFor="task-name" className="block text-sm font-bold text-ink mb-1">
              Task Name *
            </label>
            <input
              id="task-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Clean the kitchen"
              className="w-full px-4 py-2.5 rounded-xl border-2 border-ink/15 bg-white font-bold text-ink focus:border-grape focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="task-desc" className="block text-sm font-bold text-ink mb-1">
              Description
            </label>
            <textarea
              id="task-desc"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe what needs to be done..."
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl border-2 border-ink/15 bg-white font-bold text-ink focus:border-grape focus:outline-none resize-y"
            />
          </div>

          <div>
            <label htmlFor="task-points" className="block text-sm font-bold text-ink mb-1">
              Points
            </label>
            <input
              id="task-points"
              type="number"
              min={0}
              value={formData.points}
              onChange={(e) => setFormData(prev => ({ ...prev, points: parseInt(e.target.value) || 0 }))}
              className="w-full px-4 py-2.5 rounded-xl border-2 border-ink/15 bg-white font-bold text-ink focus:border-grape focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-ink mb-2">Tags</label>
            {tags.length === 0 ? (
              <p className="text-sm text-ink/60">No tags available.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <TagPill
                    key={tag.id}
                    active={formData.tagIds.includes(tag.id)}
                    onClick={() => {
                      const newTagIds = formData.tagIds.includes(tag.id)
                        ? formData.tagIds.filter(id => id !== tag.id)
                        : [...formData.tagIds, tag.id];
                      setFormData(prev => ({ ...prev, tagIds: newTagIds }));
                    }}
                  >
                    {tag.name}
                  </TagPill>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="primary" onClick={handleCreateTask} className="flex-1 justify-center">
              Create Task
            </Button>
            <Button variant="ghost" onClick={() => window.history.back()}>
              Cancel
            </Button>
          </div>
        </Card>

        <section className="flex justify-end">
          <Link href="/tasks" className="px-6 py-2 rounded-full font-bold border-2 border-ink/15 hover:bg-grape/5 hover:border-grape/40 transition-colors text-ink">
            Back to Tasks
          </Link>
        </section>
      </div>
      </PageShell>
    </ThemeProvider>
  );
}
