"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Task {
  id: string;
  name: string;
  description: string;
  points: number;
}

export default function TaskPage() {
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data for now
    setTask({
      id: "1",
      name: "Clean the kitchen",
      description: "Clean up the kitchen including counters, stove, and sink.",
      points: 10,
    });
    setLoading(false);
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Choretle</h1>
        <div className="flex gap-4">
          <Link href="/dashboard" className="hover:underline">Dashboard</Link>
          <Link href="/tasks" className="hover:underline">Tasks</Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-4">{task?.name}</h2>
          <p className="text-gray-500 dark:text-gray-400">{task?.description}</p>
          <p className="mt-2 font-bold">Points: {task?.points}</p>
        </section>

        {/* Comments Section */}
        <section>
          <h3 className="text-lg font-semibold mb-2">Comments</h3>
          <div className="space-y-4">
            <textarea placeholder="Add a comment..." className="w-full px-4 py-2 border rounded-lg" />
            <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">Post Comment</button>
          </div>
        </section>
      </main>
    </div>
  );
}
