"use client";

import { Star, ListChecks, Sparkles, Trophy, Heart, Smile, Gift } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";

export default function LandingPage() {
  return (
    <PageShell>
      <main className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center space-y-6 py-12 px-4 max-w-4xl mx-auto">
          {/* Hero */}
          <div className="mb-8">
            <div className="relative mx-auto mb-6 flex justify-center">
              <Star className="text-coral size-16 fill-coral" />
            </div>
            <h1 className="font-display text-7xl sm:text-8xl font-bold bg-gradient-to-r from-coral via-bubblegum to-grape bg-clip-text text-transparent mb-4">
              Choretle
            </h1>
            <p className="text-2xl text-ink/70 font-medium">
              Chores, points & fun for the whole family
            </p>
          </div>

          {/* CTA */}
          <div className="mt-8 mb-16 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button variant="primary" size="lg" href="/auth/signin" icon={<Sparkles size={18} />}>
              Get Started
            </Button>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-8">
            <Card accent="coral" className="text-center py-8 transition hover:-translate-y-1">
              <Heart className="size-10 text-coral mx-auto mb-4" />
              <h3 className="font-display text-xl font-bold text-ink mb-2">Set It Up Once</h3>
              <p className="text-ink/60 text-sm">Create your family, add chores, and assign them in minutes.</p>
            </Card>
            <Card accent="teal" className="text-center py-8 transition hover:-translate-y-1">
              <Smile className="size-10 text-teal mx-auto mb-4" />
              <h3 className="font-display text-xl font-bold text-ink mb-2">Kids Love It</h3>
              <p className="text-ink/60 text-sm">Earn points, build streaks, and climb the leaderboard — chores become a game.</p>
            </Card>
            <Card accent="grape" className="text-center py-8 transition hover:-translate-y-1">
              <Gift className="size-10 text-grape mx-auto mb-4" />
              <h3 className="font-display text-xl font-bold text-ink mb-2">Rotate & Reward</h3>
              <p className="text-ink/60 text-sm">Fair chore rotation, drag-and-drop boards, and a swap meet marketplace.</p>
            </Card>
          </div>

          {/* Testimonial / tagline */}
          <div className="mt-16 text-ink/50 text-sm italic">
            <p>&quot;Finally — a chore app our whole family actually wants to use.&quot;</p>
          </div>
        </div>
      </main>
    </PageShell>
  );
}
