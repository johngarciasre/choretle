"use client";

import Link from "next/link";

export default function ProfilePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <nav className="bg-white dark:bg-gray-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Choretle</h1>
            <a href="/dashboard" className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg">Sign Out</a>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <h2 className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mb-4">Profile</h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-6">
            Manage your personal settings and preferences.
          </p>
          <div className="space-y-3 max-w-md mx-auto">
            <Link href="/dashboard/rotations" className="block bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold transition">
              View Chore Rotations
            </Link>
            <Link href="/dashboard/tasks" className="block bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition">
              Manage Tasks
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
