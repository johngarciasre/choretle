import { Star, ListChecks, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";

export default function LandingPage() {
  return (
    <PageShell>
      <main className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center space-y-6 py-12 px-4">
          <Star className="mx-auto text-coral size-12 mb-4" />
          <h1 className="font-display text-6xl sm:text-7xl font-bold bg-gradient-to-r from-coral via-bubblegum to-grape bg-clip-text text-transparent">
            Choretle
          </h1>
          <p className="text-xl text-ink/70">Chores, points & fun for the whole family</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button variant="ghost" size="lg" href="/auth/signin" icon={<Star size={18} />}>
              Sign In
            </Button>
            <Button variant="primary" size="lg" href="/auth/signup" icon={<Sparkles size={18} />}>
              Sign Up
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12">
            <Card accent="coral">
              <ListChecks className="size-10 text-coral mx-auto mb-3" />
              <h3 className="font-display text-xl font-bold text-ink mb-2">Tasks & Streaks</h3>
              <p className="text-ink/60 text-sm">Set up chores, assign to kids, track completion and build awesome streaks!</p>
            </Card>
            <Card accent="teal">
              <Sparkles className="size-10 text-teal mx-auto mb-3" />
              <h3 className="font-display text-xl font-bold text-ink mb-2">Points & Rewards</h3>
              <p className="text-ink/60 text-sm">Earn points for completed tasks and watch your family climb the leaderboard.</p>
            </Card>
            <Card accent="grape">
              <Trophy className="size-10 text-grape mx-auto mb-3" />
              <h3 className="font-display text-xl font-bold text-ink mb-2">Rotations & Fun</h3>
              <p className="text-ink/60 text-sm">Drag-and-drop chore board and swap meet marketplace for families.</p>
            </Card>
          </div>
        </div>
      </main>
    </PageShell>
  );
}
