"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageShell, PageHeader, EmptyState, PageLoader, Card, Badge } from "@/components/ui";
import { TagPill, Button } from "@/components/ui";
import { Trash2, Plus, X } from "lucide-react";

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

interface Slate {
  id: string;
  name: string;
  description?: string;
  roomLocation?: string;
  frequency: string;
  interval: number;
  isActive: boolean;
  taskCount?: number;
}

const fetchSlates = async () => {
  try {
    const fid = localStorage.getItem("familyId") || "";
    const res = await fetch(`/api/slates?familyId=${fid}`);
    if (!res.ok) throw new Error("Failed to fetch slates");
    return await res.json();
  } catch (error) {
    console.error("Fetch slates failed:", error);
    return [];
  }
};

const fetchTasks = async () => {
  try {
    const fid = localStorage.getItem("familyId") || "";
    const res = await fetch(`/api/tasks?familyId=${fid}`);
    if (!res.ok) throw new Error("Failed to fetch tasks");
    return await res.json();
  } catch (error) {
    console.error("Fetch tasks failed:", error);
    return [];
  }
};

const fetchTags = async () => {
  try {
    const fid = localStorage.getItem("familyId") || "";
    const res = await fetch(`/api/tags?familyId=${fid}`);
    if (!res.ok) throw new Error("Failed to fetch tags");
    return await res.json();
  } catch (error) {
    console.error("Fetch tags failed:", error);
    return [];
  }
};

export default function SlatesPage() {
  const [slates, setSlates] = useState<Slate[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newSlateName, setNewSlateName] = useState("");
  
  const [buildingSlateId, setBuildingSlateId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const [buildingSlateTasks, setBuildingSlateTasks] = useState<Task[]>([]);
  const [buildingSlateExplicitTaskIds, setBuildingSlateExplicitTaskIds] = useState<string[]>([]);
  const [buildingSlateAutoIncludeTagIds, setBuildingSlateAutoIncludeTagIds] = useState<string[]>([]);

  useEffect(() => {
    typeof window !== "undefined" && (document.title = "Choretle - Slates");
    Promise.all([fetchSlates(), fetchTasks(), fetchTags()]).then(([slates, tasks, tags]) => {
      setSlates(slates);
      setTasks(tasks);
      setTags(tags);
      setLoading(false);
    });
  }, []);

  const familyId = typeof window !== "undefined" ? (localStorage.getItem("familyId") || "") : "";

  async function handleCreateSlate() {
    if (!newSlateName.trim()) return;
    
    try {
      const res = await fetch(`/api/slates?familyId=${familyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSlateName }),
      });

      if (!res.ok) throw new Error("Failed to create slate");
      
      const data = await res.json();
      setSlates(prev => [...prev, data]);
      setNewSlateName("");
    } catch (error) {
      console.error("Create slate failed:", error);
      alert("Failed to create slate");
    }
  }

  async function handleDeleteSlate(slateId: string, slateName: string) {
    if (!confirm(`Are you sure you want to delete "${slateName}"? This will also remove all associated rotations and task assignments.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/slates/${slateId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete slate");
      
      setSlates(prev => prev.filter(s => s.id !== slateId));
    } catch (error) {
      console.error("Delete slate failed:", error);
      alert("Failed to delete slate");
    }
  }

  async function handleStartBuilding(slateId: string) {
    try {
      const res = await fetch(`/api/slates/${slateId}/tasks`);
      if (!res.ok) throw new Error("Failed to fetch slate tasks");
      const data = await res.json();
      
      setBuildingSlateId(slateId);
      setBuildingSlateTasks(data.tasks || []);
      setBuildingSlateExplicitTaskIds(data.explicitTaskIds || []);
      setBuildingSlateAutoIncludeTagIds(data.autoIncludeTagIds || []);
    } catch (error) {
      console.error("Start building failed:", error);
      alert("Failed to load slate for editing");
    }
  }

  async function handleSaveSlate() {
    if (!buildingSlateId) return;
    
    try {
      const body = {
        explicitTaskIds: buildingSlateExplicitTaskIds,
        autoIncludeTagIds: buildingSlateAutoIncludeTagIds,
      };
      
      const res = await fetch(`/api/slates/${buildingSlateId}/tasks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Failed to save slate");
      
      setBuildingSlateId(null);
      fetchTasks();
    } catch (error) {
      console.error("Save slate failed:", error);
      alert("Failed to save slate configuration");
    }
  }

  if (loading) return <PageShell><PageLoader label="Loading slates..." /></PageShell>;

  if (buildingSlateId) {
    return (
      <PageShell>
        <SlateBuilderPage
          tasks={tasks}
          tags={tags}
          explicitTaskIds={buildingSlateExplicitTaskIds}
          autoIncludeTagIds={buildingSlateAutoIncludeTagIds}
          onToggleTask={(taskId) => 
            setBuildingSlateExplicitTaskIds(prev => 
              prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
            )
          }
          onToggleTag={(tagId) => 
            setBuildingSlateAutoIncludeTagIds(prev => 
              prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
            )
          }
          onSave={handleSaveSlate}
          onCancel={() => setBuildingSlateId(null)}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader title="Slates" subtitle="Create and configure chore slates with tasks and tags" />

      <main className="space-y-8">
        {/* Create Slate */}
        <section>
          <Card accent="coral" className="p-6 space-y-4">
            <h2 className="font-display text-xl font-bold text-ink mb-2">Create New Slate</h2>
            {slates.length === 0 && (
              <p className="text-sm text-ink/60">Click the + button below to create your first slate.</p>
            )}
          </Card>
        </section>

        {/* Slates List */}
        <section>
          <h2 className="font-display text-xl font-bold text-ink mb-4">Your Slates ({slates.length})</h2>
          {slates.length === 0 ? (
            <EmptyState icon={<span className="text-2xl">📋</span>} title="No slates yet" message="Create a slate to organize your chores!" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {slates.map(slate => (
                <Card key={slate.id} accent="sunny" className="p-6 space-y-4 relative group">
                  <button
                    onClick={() => handleDeleteSlate(slate.id, slate.name)}
                    className="absolute top-3 right-3 text-ink/20 hover:text-coral transition opacity-0 group-hover:opacity-100"
                    title={`Delete ${slate.name}`}
                    aria-label={`Delete slate: ${slate.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                  
                  <h3 className="font-display text-xl font-bold text-ink pr-4">{slate.name}</h3>
                  {slate.description && (
                    <p className="text-sm text-ink/60 mb-2">{slate.description}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <Badge status="neutral" className="text-xs px-2 py-0.5">{slate.frequency}</Badge>
                    <Badge status="points" className="text-xs px-2 py-0.5">Every {slate.interval} day{slate.interval > 1 ? "s" : ""}</Badge>
                  </div>
                  <Button variant="primary" onClick={() => handleStartBuilding(slate.id)}>
                    Configure Tasks &amp; Tags
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* FAB: Create Slate */}
      <button
        onClick={() => setShowCreateModal(true)}
        className="fixed right-4 sm:right-8 bottom-8 z-30 flex items-center justify-center w-9 h-9 rounded-full bg-coral text-white shadow-lg shadow-coral/30 hover:-translate-y-0.5 hover:brightness-105 transition-all active:translate-y-0"
        aria-label="Create new slate"
      >
        <Plus size={20} />
      </button>

      {/* Create Slate Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-bold text-ink">Create New Slate</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-ink/40 hover:text-ink transition">
                <X size={20} />
              </button>
            </div>

            <div>
              <label htmlFor="slate-name" className="block text-sm font-bold text-ink mb-1">
                Slate Name *
              </label>
              <input
                id="slate-name"
                type="text"
                value={newSlateName}
                onChange={(e) => setNewSlateName(e.target.value)}
                placeholder="e.g., Kitchen Cleaning"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateSlate();
                    setShowCreateModal(false);
                  }
                }}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-ink/15 bg-white font-bold text-ink focus:border-grape focus:outline-none"
                autoFocus
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="primary" onClick={() => { handleCreateSlate(); setShowCreateModal(false); }} className="flex-1 justify-center">
                Create Slate
              </Button>
              <Button variant="ghost" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function SlateBuilderPage({
  tasks,
  tags,
  explicitTaskIds,
  autoIncludeTagIds,
  onToggleTask,
  onToggleTag,
  onSave,
  onCancel,
}: {
  tasks: Task[];
  tags: Tag[];
  explicitTaskIds: string[];
  autoIncludeTagIds: string[];
  onToggleTask: (taskId: string) => void;
  onToggleTag: (tagId: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);

  useEffect(() => {
    setSelectedTasks(tasks.filter(t => explicitTaskIds.includes(t.id)));
  }, [tasks, explicitTaskIds]);

  const getTagMatchedTasks = () => {
    if (autoIncludeTagIds.length === 0) return new Set<string>();
    
    const matchedTaskIds = new Set<string>();
    for (const tagId of autoIncludeTagIds) {
      const tag = tags.find(t => t.id === tagId);
      if (tag) {
        tasks.forEach(task => {
          if (task.tagIds && task.tagIds.includes(tagId)) {
            matchedTaskIds.add(task.id);
          }
        });
      }
    }
    return matchedTaskIds;
  };

  const getEffectiveTasks = () => {
    const allIds = new Set(explicitTaskIds);
    for (const task of selectedTasks) {
      allIds.add(task.id);
    }
    
    const tagMatched = getTagMatchedTasks();
    for (const taskId of tagMatched) {
      allIds.add(taskId);
    }
    
    return tasks.filter(t => allIds.has(t.id));
  };

  if (!tasks.length || !tags.length) {
    return (
      <PageShell>
        <div className="min-h-screen bg-cream flex items-center justify-center p-8">
          <EmptyState icon={<span className="text-2xl">📋</span>} title="Loading slate builder..." message="Please wait while we prepare the editor..." />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Card accent="coral" className="space-y-8 p-6">
        {/* Section 1: Explicit Tasks */}
        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold text-ink">Explicit Tasks (must be completed)</h2>
          <p className="text-sm text-ink/60">
            These tasks are always included and must be explicitly marked as complete.
          </p>

          {selectedTasks.length === 0 ? (
            <p className="text-sm text-ink/60">No explicit tasks selected.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedTasks.map(task => (
                <div key={task.id} className="flex items-start justify-between p-4 bg-cream rounded-xl">
                  <div>
                    <h3 className="font-display text-lg font-bold text-ink">{task.name}</h3>
                    <Badge status="points" className="mt-1">{task.points} pts</Badge>
                  </div>
                  <Button variant="ghost" onClick={() => onToggleTask(task.id)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 2: Auto-Include by Tags */}
        <Card accent="sunny" className="pt-6 space-y-4">
          <h2 className="font-display text-xl font-bold text-ink">Auto-Include Tasks by Tag</h2>
          <p className="text-sm text-ink/60 mb-4">
            Select tags to automatically include all tasks with those tags. 
            Tasks can be in both explicit and auto-included lists (explicit wins).
          </p>

          {tags.length === 0 ? (
            <p className="text-sm text-ink/60">No tags available.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <TagPill
                  key={tag.id}
                  active={autoIncludeTagIds.includes(tag.id)}
                  onClick={() => onToggleTag(tag.id)}
                >
                  {tag.name}
                </TagPill>
              ))}
            </div>
          )}

          <p className="mt-4 text-sm text-ink/60">
            {autoIncludeTagIds.length === 0 
              ? "No tags selected for auto-inclusion."
              : `Tasks with these ${autoIncludeTagIds.length} tag(s) will be automatically included.`}
          </p>
        </Card>

        {/* Section 3: Effective Task List */}
        <Card accent="teal" className="pt-6 space-y-4">
          <h2 className="font-display text-xl font-bold text-ink">Effective Tasks (Total)</h2>
          <p className="text-sm text-ink/60 mb-4">
            This is the union of explicit tasks and tag-matched tasks.
          </p>

          {getEffectiveTasks().length === 0 ? (
            <p className="text-sm text-ink/60">No tasks will be included.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
              {getEffectiveTasks().map(task => (
                <div key={task.id} className="flex items-center justify-between p-3 bg-cream rounded-xl">
                  <div>
                    <h3 className="font-display text-lg font-bold text-ink">{task.name}</h3>
                    <Badge status="points" className="mt-1">{task.points} pts</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Action Buttons */}
        <section className="flex gap-4 pt-4 border-t border-ink/10">
          <Button variant="primary" onClick={onSave}>
            Save Slate Configuration
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </section>
      </Card>
    </PageShell>
  );
}
