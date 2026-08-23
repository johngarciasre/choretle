"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  useEffect(() => {
    fetchTasks();
    fetchTags();
  }, []);

  async function fetchTasks() {
    try {
      const tagFilter = selectedTagIds.length > 0 ? `?tagIds=${encodeURIComponent(JSON.stringify(selectedTagIds))}` : "";
      const res = await fetch(`/api/tasks${tagFilter}`);
      if (!res.ok) throw new Error("Failed to fetch tasks");
      const data = await res.json();
      setTasks(data);
    } catch (error) {
      console.error("Fetch tasks failed:", error);
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

  function toggleTag(tagId: string) {
    setSelectedTagIds(prev => 
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center sticky top-0 z-10">
        <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-sm text-gray-600 dark:text-gray-300">Back to Dashboard</span>
        </Link>
        <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Tasks</h1>
      </nav>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Tag Filter */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filter by Tags</h3>
          </div>

          {tags.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No tags available.</p>
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

          {(selectedTagIds.length === 0 && tags.length > 0) && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Select one or more tags to filter tasks.
            </p>
          )}
        </section>

        {/* Tasks Grid */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Tasks {selectedTagIds.length > 0 && `(filtered: ${selectedTagIds.length})`}</h2>
          {tasks.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No tasks found.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tasks.map((task) => (
                <Link key={task.id} href={`/tasks/${task.id}`} className="block p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                  <h3 className="font-semibold">{task.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{task.description}</p>
                  <p className="mt-2 font-bold">{task.points} pts</p>
                  {task.tagIds && task.tagIds.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {task.tagIds.map(tagId => {
                        const tag = tags.find(t => t.id === tagId);
                        return tag ? (
                          <span key={tag.id} className="px-2 py-0.5 text-xs rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                            {tag.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
