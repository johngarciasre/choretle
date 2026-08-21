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

export type { z };
