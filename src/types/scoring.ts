import { z } from "zod";

export interface ScoringStats {
  totalPoints: number;
  pointsThisWeek: number;
  pointsLastWeek: number;
  pointsToday: number;
  averagePerDay: number;
  jobsCompleted: number;
  topCategory: string;
  streakDays: number;
  weeklyGoal: number | null;
  weeklyProgress: number;
}

export interface JobCompletion {
  id: string;
  name: string;
  points: number;
  completedAt: Date;
  category: string;
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  avatarUrl?: string;
  role: string;
  totalPoints: number;
  pointsThisWeek: number;
  jobsCompleted: number;
  streakDays: number;
  trend?: "up" | "down" | "flat";
  trendValue?: number;
}

export interface UserScoringData {
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    role: string;
    pointsTotal: number;
    createdAt: Date;
  };
  stats: ScoringStats;
  completions: JobCompletion[];
  leaderboard: LeaderboardEntry[];
}

export const scoringSchema = z.object({
  totalPoints: z.number(),
  pointsThisWeek: z.number(),
  pointsLastWeek: z.number(),
  pointsToday: z.number(),
  averagePerDay: z.number(),
  jobsCompleted: z.number(),
  topCategory: z.string(),
  streakDays: z.number(),
  weeklyGoal: z.number().optional().nullable(),
  weeklyProgress: z.number(),
});

export const jobCompletionSchema = z.object({
  id: z.string(),
  name: z.string(),
  points: z.number(),
  completedAt: z.date(),
  category: z.string(),
});

// ─── Medal System ──────────────────────────────────────────────────────

export type MedalType = "points" | "tasks_completed" | "streak" | "weekly_peak" | "consistency" | "leaderboard";
export type MedalLevel = "bronze" | "silver" | "gold" | "diamond";

export const MEDAL_LEVELS: MedalLevel[] = ["bronze", "silver", "gold", "diamond"];

export interface MedalDefinition {
  type: MedalType;
  name: string;
  emoji: string;
  description: string;
  thresholds: Record<MedalLevel, number>;
}

export const MEDAL_DEFINITIONS: MedalDefinition[] = [
  {
    type: "points",
    name: "Points",
    emoji: "\u{1F4A0}",
    description: "Total lifetime points earned",
    thresholds: { bronze: 50, silver: 200, gold: 500, diamond: 1000 },
  },
  {
    type: "tasks_completed",
    name: "Tasks Completed",
    emoji: "\u{1F6E9}",
    description: "Total jobs finished",
    thresholds: { bronze: 5, silver: 20, gold: 50, diamond: 100 },
  },
  {
    type: "streak",
    name: "Streak",
    emoji: "\u{1F525}",
    description: "Consecutive days with at least one task done",
    thresholds: { bronze: 3, silver: 7, gold: 14, diamond: 30 },
  },
  {
    type: "weekly_peak",
    name: "Weekly Peak",
    emoji: "\u{1F526}",
    description: "Best single week's completions",
    thresholds: { bronze: 3, silver: 7, gold: 15, diamond: 25 },
  },
  {
    type: "consistency",
    name: "Consistency",
    emoji: "\u{1F4C5}",
    description: "Weeks with at least one task done (non-consecutive)",
    thresholds: { bronze: 4, silver: 8, gold: 16, diamond: 30 },
  },
  {
    type: "leaderboard",
    name: "Leaderboard",
    emoji: "\u{1F3AB}",
    description: "Family rank by points",
    thresholds: { bronze: 3, silver: 2, gold: 1, diamond: 1 },
  },
];

export interface EarnedMedal {
  type: MedalType;
  level: MedalLevel;
  earnedAt: string | null;
}

export const medalSchema = z.object({
  type: z.enum(["points", "tasks_completed", "streak", "weekly_peak", "consistency", "leaderboard"]),
  level: z.enum(["bronze", "silver", "gold", "diamond"]),
  earnedAt: z.string().nullable(),
});

export type { z };
