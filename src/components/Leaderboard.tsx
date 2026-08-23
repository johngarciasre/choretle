"use client";

import { Trophy } from "lucide-react";
import type { LeaderboardEntry } from "@/types/scoring";
import { Badge, Card } from "@/components/ui";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
}

const rankMedals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];

function getRankStyle(index: number, isCurrent: boolean): string {
  if (index === 0) return "bg-sunny/20 border-2 border-sunny";
  if (index === 1) return "bg-teal/20 border-2 border-teal";
  if (index === 2) return "bg-grape/20 border-2 border-grape";
  if (isCurrent) return "bg-grape/15 border-2 border-grape ring-2 ring-grape/30";
  return "bg-white border-2 border-ink/10 hover:border-grape/40";
}

export default function Leaderboard({ entries, currentUserId }: LeaderboardProps) {
  const sorted = [...entries].sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={20} className="text-grape" />
        <h3 className="font-display text-lg font-bold text-ink">Leaderboard</h3>
      </div>

      <div className="space-y-3">
        {sorted.length === 0 && (
          <div className="p-6 text-center bg-white rounded-2xl border-2 border-ink/10 text-ink/60 text-sm">
            No entries yet. Complete jobs to earn points!
          </div>
        )}

        {/* Podium: Top 3 side-by-side (order 2-1-3 on desktop) */}
        {sorted.length >= 3 && (
          <div className="grid grid-cols-3 gap-3">
            {/* 2nd place */}
            <div className={`p-4 rounded-2xl shadow-[0_8px_30px_rgba(59,47,99,0.08)] ${getRankStyle(1, false)}`}>
              <div className="text-center">
                <span className="block text-3xl mb-2">{rankMedals[1]}</span>
                <span className="font-display text-xl font-bold text-ink block mb-1">#{2}</span>
                <p className="font-bold text-ink truncate">{sorted[1]?.name}</p>
                <Badge status="points" className="mt-1 mx-auto">{sorted[1]?.totalPoints || 0} pts</Badge>
              </div>
            </div>

            {/* 1st place - center and taller */}
            <div className={`col-span-3 md:col-span-1 p-5 rounded-2xl shadow-[0_8px_30px_rgba(59,47,99,0.08)] ${getRankStyle(0, false)}`}>
              <div className="text-center">
                <span className="block text-4xl mb-3">{rankMedals[0]}</span>
                <span className="font-display text-2xl font-bold text-ink block mb-1">#{1}</span>
                <p className="font-bold text-ink truncate">{sorted[0]?.name}</p>
                <Badge status="points" className="mt-2 mx-auto inline-flex">{sorted[0]?.totalPoints || 0} pts</Badge>
              </div>
            </div>

            {/* 3rd place */}
            <div className={`p-4 rounded-2xl shadow-[0_8px_30px_rgba(59,47,99,0.08)] ${getRankStyle(2, false)}`}>
              <div className="text-center">
                <span className="block text-3xl mb-2">{rankMedals[2]}</span>
                <span className="font-display text-xl font-bold text-ink block mb-1">#{3}</span>
                <p className="font-bold text-ink truncate">{sorted[2]?.name}</p>
                <Badge status="points" className="mt-1 mx-auto">{sorted[2]?.totalPoints || 0} pts</Badge>
              </div>
            </div>
          </div>
        )}

        {/* Remaining entries as a simple list */}
        {sorted.length > 3 && (
          <Card accent="coral" className="pt-6 space-y-2">
            <h4 className="font-display text-lg font-bold text-ink mb-3">More Players</h4>
            {sorted.slice(3).map((entry, index) => {
              const actualIndex = index + 3;
              const isCurrent = !!currentUserId && entry.userId === currentUserId;

              return (
                <div key={entry.userId} className={`flex items-center gap-3 p-3 rounded-xl ${
                  isCurrent ? "bg-grape/15 border-2 border-grape" : "bg-white border-2 border-ink/10"
                }`}>
                  {/* Rank */}
                  <span className="font-display text-lg font-bold text-ink w-8">#{actualIndex + 1}</span>

                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                    isCurrent ? "bg-grape text-white" : "bg-sunny text-ink"
                  }`}>
                    {entry.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Name & Info */}
                  <div className="flex-1 min-w-0">
                    <span className={`font-bold truncate ${isCurrent ? "text-grape" : "text-ink"}`}>
                      {entry.name}
                    </span>
                    {entry.streakDays > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-sunny/30 text-ink ml-2">
                        {`${entry.streakDays}\u{1F525}`}
                      </span>
                    )}
                  </div>

                  {/* Points */}
                  <Badge status="points" className="shrink-0">{entry.totalPoints.toLocaleString()} pts</Badge>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
