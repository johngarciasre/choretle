"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageShell, Card, Badge, EmptyState, PageLoader } from "@/components/ui";
import { TagPill, Button } from "@/components/ui";
import { X } from "lucide-react";
import { error } from "@/lib/logger";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";

interface Task {
  id: string;
  name: string;
  description: string;
  points: number;
  icon?: string;
  archtype?: string;
  isActive?: boolean;
  verifyRequired?: boolean;
  tagIds?: string[];
}

interface Tag {
  id: string;
  name: string;
  color?: string;
}

interface Subtask {
  id: string;
  name: string;
  points: number;
  order: number;
}

interface TaskFormData {
  name: string;
  description: string;
  points: number;
  verifyRequired: boolean;
  tagIds: string[];
}

const fetchTask = async (id: string) => {
  try {
    const authRes = await fetch("/api/auth/me", { credentials: "include" });
    if (!authRes.ok) throw new Error("Not authenticated");
    const authData = await authRes.json();
    const familyId = authData.familyId;
    if (!familyId) throw new Error("No family ID");

    const res = await fetch(`/api/tasks/${id}?familyId=${familyId}`, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch task");
    return await res.json();
  } catch (err) {
    error({ err: err }, "Fetch task failed");
    return null;
  }
};

const fetchTags = async () => {
  try {
    const authRes = await fetch("/api/auth/me", { credentials: "include" });
    if (!authRes.ok) throw new Error("Not authenticated");
    const authData = await authRes.json();
    const familyId = authData.familyId;
    if (!familyId) throw new Error("No family ID");

    const res = await fetch(`/api/tags?familyId=${familyId}`, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch tags");
    return await res.json();
  } catch (err) {
    error({ err: err }, "Fetch tags failed");
    return [];
  }
};

const fetchSubtasks = async (taskId: string) => {
  try {
    const authRes = await fetch("/api/auth/me", { credentials: "include" });
    if (!authRes.ok) throw new Error("Not authenticated");
    const authData = await authRes.json();
    const familyId = authData.familyId;
    if (!familyId) throw new Error("No family ID");

    const res = await fetch(`/api/tasks/subtasks?taskId=${taskId}&familyId=${familyId}`, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch subtasks");
    return await res.json();
  } catch (err) {
    error({ err: err }, "Fetch subtasks failed");
    return [];
  }
};

export default function TaskPage() {
  const authChecked = useAuthRedirect();
  const taskId = typeof window !== "undefined" ? new URL(window.location.href).pathname.split("/")[2] : "";

  const [task, setTask] = useState<Task | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<TaskFormData>({
    name: "",
    description: "",
    points: 10,
    verifyRequired: false,
    tagIds: [],
  });

  // New subtask form state
  const [newSubtaskName, setNewSubtaskName] = useState("");
  const [newSubtaskPoints, setNewSubtaskPoints] = useState(0);

  useEffect(() => {
    if (!taskId) return;
    typeof window !== "undefined" && (document.title = "Choretle - Task Details");
    Promise.all([fetchTask(taskId), fetchTags(), fetchSubtasks(taskId)]).then(([taskData, tags, subtasks]) => {
      if (taskData) {
        setTask(taskData);
      }
      setTags(tags);
      setSubtasks(subtasks || []);
      setLoading(false);
    });
  }, [taskId]);

  function openEditModal() {
    if (!task) return;
    setFormData({
      name: task.name,
      description: task.description,
      points: task.points,
      verifyRequired: task.verifyRequired || false,
      tagIds: task.tagIds || [],
    });
    setShowModal(true);
  }

  async function handleUpdateTask() {
    if (!task || !taskId) return;

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: task.id,
          name: formData.name,
          description: formData.description,
          points: formData.points,
          verifyRequired: formData.verifyRequired,
          tags: formData.tagIds,
        }),
      });

      if (!res.ok) throw new Error("Failed to update task");

      const updated = await res.json();
      setTask(updated);
      setShowModal(false);
    } catch (err) {
      error({ err: err }, "Update task failed");
      alert("Failed to save changes");
    }
  }

  async function handleAddSubtask() {
    if (!taskId || !newSubtaskName.trim()) return;

    try {
      const res = await fetch("/api/tasks/subtasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          name: newSubtaskName.trim(),
          points: newSubtaskPoints,
        }),
      });

      if (!res.ok) throw new Error("Failed to add subtask");

      const added = await res.json();
      setSubtasks([...subtasks, added]);
      setNewSubtaskName("");
      setNewSubtaskPoints(0);
    } catch (err) {
      error({ err: err }, "Add subtask failed");
      alert("Failed to add subtask");
    }
  }

  async function handleDeleteSubtask(subtaskId: string) {
    try {
      const res = await fetch(`/api/tasks/subtasks/${subtaskId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete subtask");
      setSubtasks(subtasks.filter((s) => s.id !== subtaskId));
    } catch (err) {
      error({ err: err }, "Delete subtask failed");
      alert("Failed to delete subtask");
    }
  }

  if (!authChecked) return <PageShell><PageLoader label="Checking authentication..." /></PageShell>;

  if (loading) return <PageLoader label="Loading task..." />;
  if (!task) return <EmptyState icon={<span className="text-2xl">📋</span>} title="Task not found" message="The task you're looking for doesn't exist." />;

  return (
    <PageShell>
      <Card accent="coral" className="space-y-6">
        {/* Task Details */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-3xl font-bold text-ink">{task.name}</h2>
            <Button variant="ghost" onClick={openEditModal}>
              Edit
            </Button>
          </div>

          {task.description && (
            <p className="text-ink/60">{task.description}</p>
          )}

          <div className="flex items-center gap-4">
            <Badge status="points">{task.points} pts</Badge>
            {task.archtype && (
              <Badge status="neutral" className="text-xs px-2 py-0.5">{task.archtype}</Badge>
            )}
          </div>
        </section>

        {/* Subtasks Section */}
        <Card accent="teal" className="pt-6 space-y-4">
          <h3 className="font-display text-lg font-bold text-ink">Subtasks ({subtasks.length})</h3>

          {subtasks.length === 0 ? (
            <p className="text-sm text-ink/60">No subtasks yet.</p>
          ) : (
            <ul className="space-y-2">
              {subtasks.map((subtask) => (
                <li key={subtask.id} className="flex items-center justify-between p-3 bg-white rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-grape flex-shrink-0" />
                    <div>
                      <span className="font-medium text-ink">{subtask.name}</span>
                      {subtask.points > 0 && (
                        <Badge status="points" className="ml-2 text-xs">{subtask.points} pts</Badge>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteSubtask(subtask.id)}
                    className="text-red/60 hover:text-red transition-colors text-sm font-bold"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Add Subtask Form */}
          <div className="pt-3 border-t border-ink/10">
            <div className="flex gap-2">
              <input
                type="text"
                value={newSubtaskName}
                onChange={(e) => setNewSubtaskName(e.target.value)}
                placeholder="New subtask name..."
                onKeyDown={(e) => e.key === "Enter" && handleAddSubtask()}
                className="flex-1 px-4 py-2 rounded-xl border-2 border-ink/15 bg-white focus:border-grape focus:outline-none font-bold text-ink"
              />
              <input
                type="number"
                value={newSubtaskPoints}
                onChange={(e) => setNewSubtaskPoints(parseInt(e.target.value) || 0)}
                placeholder="Pts"
                className="w-80 px-4 py-2 rounded-xl border-2 border-ink/15 bg-white focus:border-grape focus:outline-none font-bold text-ink"
              />
              <Button variant="primary" onClick={handleAddSubtask}>
                Add
              </Button>
            </div>
          </div>
        </Card>

        {/* Back Link */}
        <section className="flex justify-end pt-4 border-t border-ink/10">
          <Link href="/tasks" className="px-6 py-2 rounded-full font-bold border-2 border-ink/15 hover:bg-grape/5 hover:border-grape/40 transition-colors text-ink">
            Back to Tasks
          </Link>
        </section>
      </Card>

      {/* Edit Task Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-bold text-ink">Edit Task</h3>
              <button onClick={() => setShowModal(false)} className="text-ink/40 hover:text-ink transition">
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

              <div className="flex items-center gap-2">
                <input
                  id="task-verify"
                  type="checkbox"
                  checked={formData.verifyRequired}
                  onChange={(e) => setFormData(prev => ({ ...prev, verifyRequired: e.target.checked }))}
                  className="accent-grape"
                />
                <label htmlFor="task-verify" className="text-sm font-medium text-ink">
                  Require verification on completion
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="primary" onClick={handleUpdateTask} className="flex-1 justify-center">
                Update Task
              </Button>
              <Button variant="ghost" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
