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

interface Slate {
  id: string;
  name: string;
}

export default function SlatesPage() {
  const [slates, setSlates] = useState<Slate[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create slate state
  const [newSlateName, setNewSlateName] = useState("");
  
  // Building new slate - these will be populated after creating a slate via API
  const [buildingSlateId, setBuildingSlateId] = useState<string | null>(null);
  const [buildingSlateTasks, setBuildingSlateTasks] = useState<Task[]>([]);
  const [buildingSlateExplicitTaskIds, setBuildingSlateExplicitTaskIds] = useState<string[]>([]);
  const [buildingSlateAutoIncludeTagIds, setBuildingSlateAutoIncludeTagIds] = useState<string[]>([]);

  useEffect(() => {
    fetchSlates();
    fetchTasks();
    fetchTags();
  }, []);

  async function fetchSlates() {
    try {
      const res = await fetch("/api/slates?familyId=test-family");
      if (!res.ok) throw new Error("Failed to fetch slates");
      const data = await res.json();
      setSlates(data);
    } catch (error) {
      console.error("Fetch slates failed:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTasks() {
    try {
      const res = await fetch("/api/tasks?familyId=test-family");
      if (!res.ok) throw new Error("Failed to fetch tasks");
      const data = await res.json();
      setTasks(data);
    } catch (error) {
      console.error("Fetch tasks failed:", error);
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

  async function handleCreateSlate() {
    if (!newSlateName.trim()) return;
    
    try {
      const res = await fetch("/api/slates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSlateName, familyId: "test-family" }),
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
      
      // Refresh tasks to show updated assignments
      fetchTasks();
    } catch (error) {
      console.error("Save slate failed:", error);
      alert("Failed to save slate configuration");
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  // Show building mode
  if (buildingSlateId) {
    return (
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
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center sticky top-0 z-10">
        <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-sm text-gray-600 dark:text-gray-300">Back to Dashboard</span>
        </Link>
        <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Slates</h1>
      </nav>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Create Slate */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Create New Slate</h2>
          <div className="flex gap-4">
            <input
              type="text"
              value={newSlateName}
              onChange={(e) => setNewSlateName(e.target.value)}
              placeholder="Enter slate name..."
              className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
            <button
              onClick={handleCreateSlate}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Create Slate
            </button>
          </div>
        </section>

        {/* Slates List */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Your Slates</h2>
          {slates.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No slates created yet. Create one to get started!</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {slates.map(slate => (
                <div key={slate.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                  <h3 className="text-lg font-semibold">{slate.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Click to configure tasks and tags</p>
                  <button
                    onClick={() => handleStartBuilding(slate.id)}
                    className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors w-full"
                  >
                    Configure Tasks & Tags
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// Slate Builder Component
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

  // Get tasks that match selected auto-include tags
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

  // Get all effective tasks (explicit ∪ tag-matched, deduped)
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
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Loading slate builder...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 p-8">
      <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={onCancel} className="hover:opacity-80 transition-opacity">
            ← Back to Slates
          </button>
          <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Configure Slate</h1>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Section 1: Explicit Tasks */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Explicit Tasks (must be completed)</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            These tasks are always included and must be explicitly marked as complete.
          </p>

          {selectedTasks.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No explicit tasks selected.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedTasks.map(task => (
                <div key={task.id} className="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div>
                    <h3 className="font-semibold">{task.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{task.points} pts</p>
                  </div>
                  <button
                    onClick={() => onToggleTask(task.id)}
                    className="text-red-600 hover:text-red-700 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 2: Auto-Include by Tags */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Auto-Include Tasks by Tag</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Select tags to automatically include all tasks with those tags. 
            Tasks can be in both explicit and auto-included lists (explicit wins).
          </p>

          {tags.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No tags available.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => onToggleTag(tag.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    autoIncludeTagIds.includes(tag.id)
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  }`}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}

          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            {autoIncludeTagIds.length === 0 
              ? "No tags selected for auto-inclusion."
              : `Tasks with these ${autoIncludeTagIds.length} tag(s) will be automatically included.`}
          </p>
        </section>

        {/* Section 3: Effective Task List */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Effective Tasks (Total)</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            This is the union of explicit tasks and tag-matched tasks.
          </p>

          {getEffectiveTasks().length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No tasks will be included.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {getEffectiveTasks().map(task => (
                <div key={task.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div>
                    <h3 className="font-semibold">{task.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{task.points} pts</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Action Buttons */}
        <section className="flex gap-4">
          <button
            onClick={onSave}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Save Slate Configuration
          </button>
          <button
            onClick={onCancel}
            className="px-6 py-2 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
        </section>
      </main>
    </div>
  );
}
