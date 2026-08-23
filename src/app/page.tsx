"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface User {
  id: string;
  email: string;
  role: string;
  name: string;
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        window.location.href = "/auth/signin";
      }
    } catch (e) {
      console.error("Auth check failed:", e);
      window.location.href = "/auth/signin";
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      setUser(null);
      window.location.href = "/auth/signin";
    } catch (e) {
      console.error("Sign out failed:", e);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return null; // Will redirect to signin
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <nav className="bg-white dark:bg-gray-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Choretle</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-600 dark:text-gray-300">{user.email}</span>
              <button onClick={handleSignOut} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg">
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200">Welcome!</h2>
            <p className="text-gray-600 dark:text-gray-400">Sign in to view your dashboard and manage chores.</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200">Quick Links</h2>
            <div className="space-y-2">
              <Link href="/dashboard/rotations" className="block bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition">
                View Rotations
              </Link>
              <Link href="/dashboard/tasks" className="block bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition">
                Manage Tasks
              </Link>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200">Need Help?</h2>
            <p className="text-gray-600 dark:text-gray-400">Contact support for assistance with setup and usage.</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <h2 className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mb-4">Dashboard</h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-6">
            Your family chore tracking dashboard is ready!
          </p>
          <div className="space-y-3">
            <Link href="/dashboard/rotations" className="block bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold transition transform hover:scale-105">
              View Chore Rotations
            </Link>
            <Link href="/dashboard/tasks" className="block bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition transform hover:scale-105">
              Add New Tasks
            </Link>
          </div>
        </div>
      </main>

      <footer className="bg-white dark:bg-gray-800 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 dark:text-gray-400">
          <p>&copy; 2026 Choretle. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
