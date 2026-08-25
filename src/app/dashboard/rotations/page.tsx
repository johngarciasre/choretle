"use client";

import { useEffect } from "react";
import { PageShell, PageLoader } from "@/components/ui";
import { Card } from "@/components/ui/Card";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";

export default function RotationsPage() {
  const authChecked = useAuthRedirect();
  useEffect(() => {
    typeof window !== 'undefined' && (document.title = "Choretle - Rotations");
  }, []);

  if (!authChecked) return <PageShell><PageLoader label="Checking authentication..." /></PageShell>;

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
