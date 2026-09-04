"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell, Card, Badge, EmptyState, PageLoader } from "@/components/ui";
import { TagPill, Button } from "@/components/ui";
import PhotoUploadModal from "@/components/PhotoUploadModal";
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
  const router = useRouter();
  const taskId = typeof window !== "undefined" ? new URL(window.location.href).pathname.split("/")[2] : "";
  
  const [task, setTask] = useState<Task | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showUpload, setShowUpload] = useState(false);

  // New subtask form state
  const [newSubtaskName, setNewSubtaskName] = useState("");
  const [newSubtaskPoints, setNewSubtaskPoints] = useState(0);

  useEffect(() => {
    if (!taskId) return;
    typeof window !== "undefined" && (document.title = "Choretle - Task Details");
    Promise.all([fetchTask(taskId), fetchTags(), fetchSubtasks(taskId)]).then(([taskData, tags, subtasks]) => {
      if (taskData) {
        setTask(taskData);
        setNameValue(taskData.name);
        setSelectedTagIds(taskData.tagIds || []);
      }
      setTags(tags);
      setSubtasks(subtasks || []);
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
        verifyRequired: task.verifyRequired,
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

  function toggleTag(tagId: string) {
    setSelectedTagIds(prev => 
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  }

  if (!authChecked) return <PageShell><PageLoader label="Checking authentication..." /></PageShell>;

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

          {/* Verify Required Toggle */}
          <div className="flex items-center gap-3 pt-2 border-t border-ink/10 pt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={task.verifyRequired || false}
                onChange={(e) => setTask({ ...task, verifyRequired: e.target.checked })}
                className="mr-1 accent-grape"
              />
              <span className="text-sm font-medium text-ink">Require verification on completion</span>
            </label>
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

        {/* Tag Editor */}
        <section className="pt-4 border-t border-ink/10">
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
      </Card>

      {showUpload && (
        <PhotoUploadModal
          isOpen={showUpload}
          onClose={() => setShowUpload(false)}
          objectType="task"
          objectId={taskId}
        />
      )}
    </PageShell>
  );
}
