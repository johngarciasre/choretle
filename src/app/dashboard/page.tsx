"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ListChecks, Trophy, User } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface User extends SupabaseUser {
  id: string;
  email: string;
  role: string;
  name: string;
}

async function checkAuthInternal() {
  try {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      const data = await res.json();
      return data.user;
    } else {
      window.location.href = "/auth/signin";
      return null;
    }
  } catch (e) {
    console.error("Auth check failed:", e);
    window.location.href = "/auth/signin";
    return null;
  }
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthInternal().then((u) => {
      if (u) setUser(u);
    }).finally(() => setLoading(false));
  }, []);

  // Sign-out is handled by NavBar, so we don't need to do it here

  if (loading) {
    return <PageShell><main className="flex items-center justify-center min-h-[60vh]"><div className="text-ink/60 font-bold">Loading...</div></main></PageShell>;
  }

  if (!user) {
    return null; // Will redirect to signin
  }

  return (
    <PageShell>
      <main className="space-y-6">
        <div className="text-center py-8">
          <h1 className="font-display text-4xl font-bold text-ink mb-2">Welcome back!</h1>
          <p className="text-ink/60 text-lg">Ready to track chores and earn points?</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card accent="grape" className="flex flex-col items-center text-center p-6">
            <div className="bg-grape/20 rounded-full p-4 mb-4">
              <Trophy className="text-grape size-10" />
            </div>
            <h2 className="font-display text-2xl font-bold text-ink mb-3">Rotations</h2>
            <p className="text-ink/60 text-sm mb-4">View and manage your chore rotation schedule.</p>
            <Button variant="grape" size="md" href="/rotations">
              View Rotations
            </Button>
          </Card>

          <Card accent="teal" className="flex flex-col items-center text-center p-6">
            <div className="bg-teal/20 rounded-full p-4 mb-4">
              <ListChecks className="text-teal size-10" />
            </div>
            <h2 className="font-display text-2xl font-bold text-ink mb-3">Tasks</h2>
            <p className="text-ink/60 text-sm mb-4">Manage your assigned chores and tasks.</p>
            <Button variant="success" size="md" href="/tasks">
              View Tasks
            </Button>
          </Card>

          <Card accent="sunny" className="flex flex-col items-center text-center p-6">
            <div className="bg-sunny/20 rounded-full p-4 mb-4">
              <User className="text-sunny size-10" />
            </div>
            <h2 className="font-display text-2xl font-bold text-ink mb-3">Your Profile</h2>
            <p className="text-ink/60 text-sm mb-4">View your stats, streaks, and achievements.</p>
            <Button variant="ghost" size="md" href={user ? `/profile/${user.id}` : undefined}>
              View Profile
            </Button>
          </Card>
        </div>
      </main>
    </PageShell>
  );
}
