"use client";

import { useState } from "react";
import Link from "next/link";

export default function FamilyPage() {
  const [name, setName] = useState("");
  const [weekStartDay, setWeekStartDay] = useState(0);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, weekStartDay }),
      });
      if (!res.ok) throw new Error("Failed to create family");
      window.location.href = "/dashboard";
    } catch (err) {
      console.error(err);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/family/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode }),
      });
      if (!res.ok) throw new Error("Failed to join family");
      window.location.href = "/dashboard";
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <div className="space-y-6 p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-3xl font-bold text-center">Welcome to Choretle</h1>

        <form onSubmit={handleCreate} className="space-y-4">
          <input
            type="text"
            placeholder="Family name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded-lg"
          />
          <button type="submit" className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
            Create Family
          </button>
        </form>

        <div className="text-center">
          <button onClick={() => setShowJoin(!showJoin)} className="text-indigo-600 underline">
            Join an existing family
          </button>
          {showJoin && (
            <form onSubmit={handleJoin} className="mt-4 space-y-4">
              <input
                type="text"
                placeholder="Invite code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                required
                className="w-full px-4 py-2 border rounded-lg"
              />
              <button type="submit" className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
                Join Family
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
          <Link href="/auth/signin" className="hover:underline">Sign in</Link> or{" "}
          <Link href="/auth/signup" className="hover:underline">sign up</Link> to continue
        </p>
      </div>
    </div>
  );
}
