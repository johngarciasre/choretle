"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
    fetchTask(taskId);
    fetchTags();
  }, [taskId]);

  async function fetchTask(id: string) {
    try {
      const res = await fetch(`/api/tasks/${id}`);
      if (!res.ok) throw new Error("Failed to fetch task");
      const data = await res.json();
      setTask(data);
      setNameValue(data.name);
      setSelectedTagIds(data.tagIds || []);
    } catch (error) {
      console.error("Fetch task failed:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTags() {
    try {
      const res = await fetch("/api/tags?familyId=test-family");
      if (!res.ok) throw new Error("Failed to fetch tags");
      const data = await res.json();
      setTags(data);
    } catch (error) {
      console.error("Fetch tags failed:", error);
    }
  }

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

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (!task) return <div className="flex items-center justify-center min-h-screen">Task not found</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center sticky top-0 z-10">
        <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-sm text-gray-600 dark:text-gray-300">Back to Dashboard</span>
        </Link>
        <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{task.name}</h1>
      </nav>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Task Details */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 space-y-4">
          <div>
            {editingName ? (
              <input
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            ) : (
              <h2 
                className="text-2xl font-semibold cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400"
                onClick={() => { setEditingName(true); setNameValue(task.name); }}
              >
                {task.name}
              </h2>
            )}
          </div>

          <p className="text-gray-500 dark:text-gray-400">{task.description}</p>
          
          <div className="flex items-center gap-6">
            <span className="font-bold text-indigo-600 dark:text-indigo-400">{task.points} pts</span>
            {task.archtype && (
              <>
                <span className="text-sm text-gray-500 dark:text-gray-400">Type:</span>
                <span className="px-2 py-1 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">{task.archtype}</span>
              </>
            )}
          </div>

          {/* Tag Editor */}
          <div className="pt-4 border-t">
            <h3 className="text-lg font-semibold mb-3">Tags</h3>
            
            {tags.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No tags available. Create tags in the app settings.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      selectedTagIds.includes(tag.id)
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            )}

            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Select tags to assign to this task. Tags can be used for filtering and auto-inclusion in slates.
            </p>
          </div>
        </section>

        {/* Action Buttons */}
        <section className="flex gap-4">
          {editingName ? (
            <>
              <button
                onClick={handleUpdateTask}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Save Changes
              </button>
              <button
                onClick={() => { setEditingName(false); setNameValue(task.name); }}
                className="bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-6 py-2 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => { setEditingName(true); setNameValue(task.name); }}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Edit Task Details
            </button>
          )}
          
          <Link href="/tasks" className="px-6 py-2 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Back to Tasks
          </Link>
        </section>

        {/* Comments Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">Comments</h3>
          <div className="space-y-4">
            <textarea 
              placeholder="Add a comment..." 
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              rows={4}
            />
            <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
              Post Comment
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
