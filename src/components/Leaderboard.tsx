"use client";

import { Award, TrendingUp, TrendingDown } from "lucide-react";
import type { LeaderboardEntry } from "@/types/scoring";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
}

const rankMedals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];

function getRankStyle(index: number, isCurrent: boolean): string {
  if (index === 0) return "from-amber-300 to-yellow-200 dark:from-amber-700 dark:to-yellow-600 border-amber-400 dark:border-amber-500";
  if (index === 1) return "from-gray-200 to-slate-100 dark:from-gray-700 dark:to-gray-800 border-gray-300 dark:border-gray-600";
  if (index === 2) return "from-orange-100 to-orange-50 dark:from-orange-800 dark:to-orange-900 border-orange-300 dark:border-orange-700";
  if (isCurrent) return "bg-indigo-50 dark:bg-indigo-950 border-indigo-300 dark:border-indigo-600 ring-2 ring-indigo-300 dark:ring-indigo-500";
  return "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600";
}

function getTrendIcon(trend?: string) {
  if (trend === "up") return <TrendingUp size={14} className="text-emerald-500" />;
  if (trend === "down") return <TrendingDown size={14} className="text-red-500" />;
  return null;
}

function getTrendColor(trend?: string) {
  if (trend === "up") return "text-emerald-600 dark:text-emerald-400";
  if (trend === "down") return "text-red-600 dark:text-red-400";
  return "text-gray-500 dark:text-gray-400";
}

export default function Leaderboard({ entries, currentUserId }: LeaderboardProps) {
  const sorted = [...entries].sort((a, b) => b.totalPoints - a.totalPoints);
  const maxPoints = sorted[0]?.totalPoints || 1;

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-4">
        <Award size={20} className="text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Leaderboard</h3>
      </div>

      <div className="space-y-2 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800">
        {sorted.length === 0 && (
          <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
            No entries yet. Complete jobs to earn points!
          </div>
        )}

        {sorted.map((entry, index) => {
          const isCurrent = !!currentUserId && entry.userId === currentUserId;
          const rankStyle = getRankStyle(index, isCurrent);
          const showBar = sorted.length > 1;
          const progressPercent = maxPoints > 0 ? (entry.totalPoints / maxPoints) * 100 : 0;

          return (
            <div
              key={entry.userId}
              className={`flex items-center gap-3 px-4 py-3 transition-shadow ${rankStyle}`}
            >
              {/* Rank */}
              <div className="w-8 text-center flex-shrink-0">
                {index < 3 ? (
                  <span className="text-xl">{rankMedals[index]}</span>
                ) : (
                  <span className="text-sm font-bold text-gray-500 dark:text-gray-400">#{index + 1}</span>
                )}
              </div>

              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${
                index === 0 ? "bg-gradient-to-br from-amber-400 to-yellow-300" :
                index === 1 ? "bg-gradient-to-br from-gray-400 to-slate-300" :
                index === 2 ? "bg-gradient-to-br from-orange-400 to-orange-300" :
                isCurrent ? "bg-gradient-to-br from-indigo-500 to-purple-500" :
                "bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700"
              }`}>
                {entry.name.charAt(0).toUpperCase()}
              </div>

              {/* Name & Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium truncate ${isCurrent ? "text-indigo-600 dark:text-indigo-300" : "text-gray-900 dark:text-gray-100"}`}>
                    {entry.name}
                  </span>
                  {entry.streakDays > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-300">
                      {entry.streakDays}🔤
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{entry.role}</p>

                {/* Progress bar */}
                {showBar && (
                  <div className="mt-1.5 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        index === 0 ? "bg-gradient-to-r from-amber-400 to-yellow-300" :
                        index === 1 ? "bg-gradient-to-r from-gray-400 to-slate-300" :
                        index === 2 ? "bg-gradient-to-r from-orange-400 to-orange-300" :
                        isCurrent ? "bg-gradient-to-r from-indigo-500 to-purple-500" :
                        "bg-gradient-to-r from-indigo-300 to-blue-400"
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Points */}
              <div className="text-right flex-shrink-0">
                <span className={`text-sm font-bold ${
                  index === 0 ? "text-amber-600 dark:text-amber-300" :
                  index === 1 ? "text-gray-700 dark:text-gray-200" :
                  index === 2 ? "text-orange-600 dark:text-orange-300" :
                  isCurrent ? "text-indigo-600 dark:text-indigo-300" :
                  "text-gray-900 dark:text-gray-100"
                }`}>
                  {entry.totalPoints.toLocaleString()}
                </span>
                <div className="flex items-center gap-1 justify-end text-xs">
                  {getTrendIcon(entry.trend)}
                  <span className={getTrendColor(entry.trend)}>
                    {entry.trendValue ? `${entry.trendValue > 0 ? "+" : ""}${entry.trendValue}` : "0"} pts
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
