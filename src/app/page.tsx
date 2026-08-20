export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <div className="text-center space-y-4 p-8">
        <h1 className="text-6xl font-bold text-indigo-600 dark:text-indigo-400">Choretle</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400">
          A chore and habit tracking app for families
        </p>
        <div className="mt-8 space-y-2 text-gray-500 dark:text-gray-400">
          <p>Set up tasks, assign to kids, track completion, and earn points.</p>
          <p className="text-sm mt-4">Build in progress — check back soon!</p>
        </div>
      </div>
    </main>
  );
}
