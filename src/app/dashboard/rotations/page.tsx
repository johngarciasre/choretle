"use client";

import { useEffect } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";

export default function RotationsPage() {
  useEffect(() => {
    typeof window !== 'undefined' && (document.title = "Choretle - Rotations");
  }, []);

  return (
    <PageShell>
      <main className="flex items-center justify-center min-h-[60vh]">
        <Card accent="grape" className="w-full max-w-md p-8 text-center">
          <h1 className="font-display text-3xl font-bold text-ink mb-4">Chore Rotations</h1>
          <p className="text-ink/60 text-lg mb-6">
            View and manage your family&apos;s chore rotation schedule.
          </p>
          <div className="bg-grape/10 border-2 border-grape rounded-xl p-4 max-w-sm mx-auto">
            <p className="text-grape/80 font-bold">
              🚧 This feature is under development. Coming soon!
            </p>
          </div>
        </Card>
      </main>
    </PageShell>
  );
}
