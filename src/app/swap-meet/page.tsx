"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface SwapMeetItem {
  id: string;
  slateName: string;
  sharingFamily: string;
  status: string;
}

export default function SwapMeetPage() {
  const [items, setItems] = useState<SwapMeetItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data for now
    setItems([
      { id: "1", slateName: "Kitchen Cleanup", sharingFamily: "Smith Family", status: "available" },
      { id: "2", slateName: "Weekly Chores", sharingFamily: "Johnson Family", status: "available" },
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
          <Link href="/swap-meet" className="hover:underline text-indigo-600 font-semibold">Swap Meet</Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-4">Swap Meet Marketplace</h2>
          {items.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No slates available for sharing.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <div key={item.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                  <h3 className="font-semibold">{item.slateName}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Shared by {item.sharingFamily}</p>
                  <span className={cn(
                    "inline-block mt-2 px-2 py-1 rounded-full text-xs font-semibold",
                    item.status === "available" && "bg-green-100 dark:bg-green-900 text-green-600"
                  )}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
