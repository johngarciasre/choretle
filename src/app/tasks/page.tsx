"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageShell, PageHeader, EmptyState, Badge, PageLoader, Card } from "@/components/ui";
import { TagPill, Button } from "@/components/ui";
import { Trash2, Plus, Edit, X } from "lucide-react";
import { error } from "@/lib/logger";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";

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

interface TaskFormData {
  name: string;
  description: string;
  points: number;
  tagIds: string[];
}

const fetchTasks = async () => {
  try {
    const authRes = await fetch("/api/auth/me");
    if (!authRes.ok) throw new Error("Not authenticated");
    const authData = await authRes.json();
    const familyId = authData.familyId;

    const res = await fetch(`/api/tasks?familyId=${familyId}`);
    if (!res.ok) throw new Error("Failed to fetch tasks");
    return await res.json();
  } catch (err) {
    error({ err: err }, "Fetch tasks failed");
    return [];
  }
};

const fetchTags = async () => {
  try {
    const authRes = await fetch("/api/auth/me");
    if (!authRes.ok) throw new Error("Not authenticated");
    const authData = await authRes.json();
    const familyId = authData.familyId;

    const res = await fetch(`/api/tags?familyId=${familyId}`);
    if (!res.ok) throw new Error("Failed to fetch tags");
    return await res.json();
  } catch (err) {
    error({ err: err }, "Fetch tags failed");
    return [];
  }
};

export default function TasksPage() {
  const authChecked = useAuthRedirect();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<TaskFormData>({
    name: "",
    description: "",
    points: 10,
    tagIds: [],
  });

  useEffect(() => {
    typeof window !== "undefined" && (document.title = "Choretle - Tasks");
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

  const openCreateModal = () => {
    setEditingTask(null);
    setFormData({ name: "", description: "", points: 10, tagIds: [] });
    setShowModal(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setFormData({
      name: task.name,
      description: task.description || "",
      points: task.points,
      tagIds: task.tagIds || [],
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTask(null);
  };

  async function handleSaveTask() {
    if (!formData.name.trim()) return;

    try {
      // Get familyId from auth endpoint
      const authRes = await fetch("/api/auth/me");
      if (!authRes.ok) throw new Error("Not authenticated");
      const authData = await authRes.json();
      const familyId = authData.familyId;

      const isEdit = editingTask !== null;
      const res = await fetch(
        isEdit ? `/api/tasks/${editingTask!.id}?familyId=${familyId}` : `/api/tasks?familyId=${familyId}`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...formData,
            ...(isEdit ? { id: editingTask!.id } : {}),
          }),
        }
      );

      if (!res.ok) throw new Error("Failed to save task");

      const data = await res.json();
      if (isEdit) {
        setTasks(prev => prev.map(t => t.id === editingTask!.id ? data : t));
      } else {
        setTasks(prev => [...prev, data]);
      }
      closeModal();
    } catch (err) {
      error({ err: err }, "Save task failed");
      alert("Failed to save task");
    }
  }

  async function handleDeleteTask(taskId: string, taskName: string) {
    if (!confirm(`Are you sure you want to delete "${taskName}"?`)) {
      return;
    }

    try {
      // Get familyId from auth endpoint
      const authRes = await fetch("/api/auth/me");
      if (!authRes.ok) throw new Error("Not authenticated");
      const authData = await authRes.json();
      const familyId = authData.familyId;

      const res = await fetch(`/api/tasks/${taskId}?familyId=${familyId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete task");

      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      error({ err: err }, "Delete task failed");
      alert("Failed to delete task");
    }
  }

  if (!authChecked) return <PageShell><PageLoader label="Checking authentication..." /></PageShell>;
  if (loading) return <PageShell><PageLoader label="Loading tasks..." /></PageShell>;

  return (
    <PageShell>
      <PageHeader 
        title="Tasks" 
        subtitle="Browse and manage all available tasks for your family"
      />

      <div className="relative space-y-8 pb-16">
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
          <h2 className="font-display text-xl font-bold text-ink mb-4">
            Tasks {selectedTagIds.length > 0 && `(filtered: ${selectedTagIds.length})`}
          </h2>
          {tasks.length === 0 ? (
            <EmptyState icon={<span className="text-2xl">📋</span>} title="No tasks found" message="Create a task to get started!" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tasks.map((task) => (
                <Card key={task.id} accent="teal" className="p-6 space-y-4 relative group">
                  <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => openEditModal(task)}
                      className="text-ink/30 hover:text-grape transition"
                      title={`Edit ${task.name}`}
                      aria-label={`Edit task: ${task.name}`}
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteTask(task.id, task.name)}
                      className="text-ink/30 hover:text-coral transition"
                      title={`Delete ${task.name}`}
                      aria-label={`Delete task: ${task.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <Link href={`/tasks/${task.id}`} className="block">
                    <h3 className="font-display text-lg font-bold text-ink pr-4">{task.name}</h3>
                    {task.description && (
                      <p className="text-sm text-ink/60 mt-2">{task.description}</p>
                    )}
                  </Link>
                  
                  <div className="mt-2 flex items-center justify-between">
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
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* FAB: Create Task */}
      <button
        onClick={openCreateModal}
        className="fixed right-4 sm:right-8 bottom-8 z-30 flex items-center justify-center w-9 h-9 rounded-full bg-coral text-white shadow-lg shadow-coral/30 hover:-translate-y-0.5 hover:brightness-105 transition-all active:translate-y-0"
        aria-label="Create new task"
      >
        <Plus size={20} />
      </button>

      {/* Task Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-bold text-ink">
                {editingTask ? "Edit Task" : "Create New Task"}
              </h3>
              <button onClick={closeModal} className="text-ink/40 hover:text-ink transition">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
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
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="primary" onClick={handleSaveTask} className="flex-1 justify-center">
                {editingTask ? "Update Task" : "Create Task"}
              </Button>
              <Button variant="ghost" onClick={closeModal}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
