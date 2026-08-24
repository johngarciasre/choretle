"use client";

import { useEffect } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import Link from "next/link";

export default function ProfilePage() {
  useEffect(() => {
    typeof window !== 'undefined' && (document.title = "Choretle - Profile");
  }, []);

  return (
    <PageShell>
      <main className="flex items-center justify-center min-h-[60vh]">
        <Card accent="sunny" className="w-full max-w-md p-8 text-center">
          <h1 className="font-display text-3xl font-bold text-ink mb-4">Profile</h1>
          <p className="text-ink/60 text-lg mb-6">
            Manage your personal settings and preferences.
          </p>
          <div className="space-y-3 max-w-md mx-auto">
            <Link href="/rotations" className="block bg-sunny/20 border-2 border-sunny hover:bg-sunny/30 text-sunny px-6 py-3 rounded-xl font-bold transition">
              View Chore Rotations
            </Link>
            <Link href="/tasks" className="block bg-teal/20 border-2 border-teal hover:bg-teal/30 text-teal px-6 py-3 rounded-xl font-bold transition">
              Manage Tasks
            </Link>
          </div>
        </Card>
      </main>
    </PageShell>
  );
}
