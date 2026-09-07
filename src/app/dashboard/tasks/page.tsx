"use client";

import { useEffect } from "react";
import { PageShell, PageLoader } from "@/components/ui";
import { Card } from "@/components/ui/Card";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { ThemeProvider } from "@/lib/theme";
import { useFamilyTheme } from "@/lib/use-family-theme";

export default function TasksPage() {
  const authChecked = useAuthRedirect();
  const familyTheme = useFamilyTheme();
  useEffect(() => {
    typeof window !== 'undefined' && (document.title = "Choretle - Tasks");
  }, []);

  if (!authChecked) return <ThemeProvider familyTheme={familyTheme}><PageShell><PageLoader label="Checking authentication..." /></PageShell></ThemeProvider>;

  return (
    <ThemeProvider familyTheme={familyTheme}>
      <PageShell>
      <main className="flex items-center justify-center min-h-[60vh]">
        <Card accent="teal" className="w-full max-w-md p-8 text-center">
          <h1 className="font-display text-3xl font-bold text-ink mb-4">Tasks</h1>
          <p className="text-ink/60 text-lg mb-6">
            Create and manage chores for your family.
          </p>
          <div className="bg-teal/10 border-2 border-teal rounded-xl p-4 max-w-sm mx-auto">
            <p className="text-teal/80 font-bold">
              🚧 This feature is under development. Coming soon!
            </p>
          </div>
        </Card>
      </main>
      </PageShell>
    </ThemeProvider>
  );
}
