"use client";

export default function TasksPage() {
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
          <h2 className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mb-4">Tasks</h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-6">
            Create and manage chores for your family.
          </p>
          <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 max-w-md mx-auto">
            <p className="text-yellow-800 dark:text-yellow-200">
              🚧 This feature is under development. Coming soon!
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
