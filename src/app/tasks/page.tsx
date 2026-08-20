"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Task {
  id: string;
  name: string;
  description: string;
  points: number;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data for now
    setTasks([
      { id: "1", name: "Clean the kitchen", description: "Clean up the kitchen", points: 10 },
      { id: "2", name: "Take out the trash", description: "Take out the trash", points: 5 },
      { id: "3", name: "Vacuum the living room", description: "Vacuum the living room", points: 15 },
    ]);
    setLoading(false);
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Choretle</h1>
        <div className="flex gap-4">
          <Link href="/dashboard" className="hover:underline">Dashboard</Link>
          <Link href="/tasks" className="hover:underline text-indigo-600 font-semibold">Tasks</Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-4">Tasks</h2>
          {tasks.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No tasks found.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tasks.map((task) => (
                <Link key={task.id} href={`/tasks/${task.id}`} className="block p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                  <h3 className="font-semibold">{task.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{task.description}</p>
                  <p className="mt-2 font-bold">{task.points} pts</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
