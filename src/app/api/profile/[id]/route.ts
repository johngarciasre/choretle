import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

// ─── Middleware: Verify Auth Token ──────────────────────────────────
async function verifyAuth(request: NextRequest): Promise<{ userId: string; familyId?: string } | { error: string }> {
  const cookie = request.cookies.get("auth-token")?.value;
  if (!cookie) {
    return { error: "No token provided" };
  }

  try {
    const parts = cookie.split(".");
    if (parts.length !== 3) {
      return { error: "Invalid token format" };
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const now = Math.floor(Date.now() / 1000);
    
    if (payload.exp && payload.exp < now) {
      return { error: "Token expired" };
    }

    // Ensure DB is initialized to validate user exists
    const db = await initDb();
    if (!db) {
      return { error: "Database not initialized" };
    }

    const user = await db.select().from(schema.users).where(eq(schema.users.id, payload.userId)).first();
    if (!user) {
      return { error: "User not found" };
    }

    return { userId: payload.userId, familyId: payload.familyId || undefined };
  } catch (error) {
    console.error("Token verification failed:", error);
    return { error: "Invalid token" };
  }
}

// ─── GET: Fetch user profile with stats and completions ──────────────
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("id");

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // If called from client-side, verify via header
    const authResult = await verifyAuth(request);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    // Allow fetching own profile or profile of user in same family
    let targetUserId = userId;
    
    const db = await initDb();
    if (!db) {
      throw new Error("Database not initialized");
    }

    // If different from authenticated user, verify they're in same family
    if (userId !== authResult.userId) {
      const requestingUser = await db.select().from(schema.users).where(eq(schema.users.id, authResult.userId)).first();
      const targetUser = await db.select().from(schema.users).where(eq(schema.users.id, userId)).first();

      if (!requestingUser || !targetUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      if (requestingUser.familyId !== targetUser.familyId) {
        return NextResponse.json({ error: "Cannot access another family's profile" }, { status: 403 });
      }
    }

    // Fetch user data
    const userData = await db.select().from(schema.users).where(eq(schema.users.id, userId)).first();
    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch completed jobs for this user
    const completedJobs = await db.select({
      job: schema.jobs,
      task: schema.tasks,
      slate: schema.slates,
    }).from(schema.jobs)
      .leftJoin(schema.tasks, eq(schema.jobs.slateTaskId, schema.tasks.id))
      .leftJoin(schema.slates, eq(schema.jobs.slateTaskId, schema.slates.id))
      .where(
        and(
          eq(schema.jobs.status, "done"),
          eq(schema.jobs.assignedTo, userId)
        )
      )
      .orderBy(desc(schema.jobs.completedAt));

    // Calculate stats
    const totalPoints = userData.pointsTotal || 0;
    
    // Points this week (last 7 days)
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const pointsThisWeek = completedJobs
      .filter((job: any) => job.completedAt && new Date(job.completedAt) > oneWeekAgo)
      .reduce((sum: number, job: any) => sum + (job.points || 0), 0);

    // Jobs completed count
    const jobsCompleted = completedJobs.length;

    // Average points per job
    const averagePointsPerJob = jobsCompleted > 0 ? Math.round((totalPoints / jobsCompleted) * 10) / 10 : 0;

    // Calculate streak (simplified - consecutive days with completions ending today or yesterday)
    const streakDays = calculateStreak(completedJobs);

    // Points last week for comparison
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const pointsLastWeek = completedJobs
      .filter((job: any) => job.completedAt && new Date(job.completedAt) > fourteenDaysAgo && new Date(job.completedAt) <= oneWeekAgo)
      .reduce((sum: number, job: any) => sum + (job.points || 0), 0);

    // Get recent completions with category info
    const recentCompletions = completedJobs.slice(0, 20).map(({ job, task }: { job: any; task: any }) => {
      let category = "Unknown";
      
      if (task) {
        category = getTaskCategory(task);
      } else if (job.description) {
        category = extractCategoryFromDescription(job.description);
      }

      return {
        id: job.id,
        name: job.name,
        points: job.points || 0,
        completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : "",
        category,
        taskName: task?.name || null,
      };
    });

    return NextResponse.json({
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        avatarUrl: userData.avatarUrl,
        role: userData.role,
        pointsTotal: totalPoints,
        createdAt: userData.createdAt ? new Date(userData.createdAt).toISOString() : "",
      },
      stats: {
        totalPoints,
        pointsThisWeek,
        pointsLastWeek,
        jobsCompleted,
        averagePointsPerJob,
        streakDays,
        longestStreak: calculateLongestStreak(completedJobs),
      },
      completions: recentCompletions,
    });
  } catch (error) {
    console.error("Profile GET failed:", error);
    if (error instanceof Error && error.message.includes("Database not initialized")) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

// ─── Helper Functions ──────────────────────────────────────────────

function calculateStreak(completedJobs: any[]): number {
  if (completedJobs.length === 0) return 0;

  // Sort by date descending
  const sorted = [...completedJobs].sort((a, b) => 
    new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
  );

  let streak = 0;
  let lastDate = null;

  for (const job of sorted) {
    if (!job.completedAt) continue;

    const date = new Date(job.completedAt);
    
    if (!lastDate) {
      lastDate = date;
      continue;
    }

    // Check if consecutive day
    const diffTime = Math.abs(lastDate.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      streak++;
      lastDate = date;
    } else if (diffDays > 1 && diffDays <= 3) {
      // Small gap - reset to 1
      streak = 1;
      lastDate = date;
    } else {
      break;
    }
  }

  return streak;
}

function calculateLongestStreak(completedJobs: any[]): number {
  if (completedJobs.length === 0) return 0;

  // Sort by date descending
  const sorted = [...completedJobs].sort((a, b) => 
    new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
  );

  let longestStreak = 0;
  let currentStreak = 0;
  let lastDate = null;

  for (const job of sorted) {
    if (!job.completedAt) continue;

    const date = new Date(job.completedAt);
    
    if (!lastDate) {
      lastDate = date;
      currentStreak++;
      continue;
    }

    // Check if consecutive day
    const diffTime = Math.abs(lastDate.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      currentStreak++;
      lastDate = date;
    } else if (diffDays > 1 && diffDays <= 3) {
      // Small gap - reset to 1
      currentStreak = 1;
      lastDate = date;
    } else {
      longestStreak = Math.max(longestStreak, currentStreak);
      break;
    }
  }

  return Math.max(longestStreak, currentStreak);
}

function getTaskCategory(task: any): string {
  // Map task icons/names to categories
  const categoryMap: Record<string, string> = {
    "kitchen": "Kitchen",
    "bathroom": "Bathroom",
    "bedroom": "Bedroom",
    "living_room": "Living Room",
    "cleaning": "Cleaning",
    "laundry": "Laundry",
    "trash": "Trash",
    "dishes": "Kitchen",
  };

  const lowerName = (task.name || "").toLowerCase();
  const lowerDesc = (task.description || "").toLowerCase();

  for (const [key, category] of Object.entries(categoryMap)) {
    if (lowerName.includes(key) || lowerDesc.includes(key)) {
      return category;
    }
  }

  // Check icon
  if (task.icon) {
    const lowerIcon = task.icon.toLowerCase();
    for (const [key, category] of Object.entries(categoryMap)) {
      if (lowerIcon.includes(key)) {
        return category;
      }
    }
  }

  return "Chores";
}

function extractCategoryFromDescription(description: string): string {
  const lowerDesc = description.toLowerCase();
  
  if (lowerDesc.includes("kitchen") || lowerDesc.includes("cook") || lowerDesc.includes("dish")) {
    return "Kitchen";
  }
  if (lowerDesc.includes("bathroom") || lowerDesc.includes("toilet") || lowerDesc.includes("shower")) {
    return "Bathroom";
  }
  if (lowerDesc.includes("bedroom") || lowerDesc.includes("sleep") || lowerDesc.includes("pillow")) {
    return "Bedroom";
  }
  if (lowerDesc.includes("living") || lowerDesc.includes("sitting") || lowerDesc.includes("couch")) {
    return "Living Room";
  }
  if (lowerDesc.includes("laundry") || lowerDesc.includes("shirt") || lowerDesc.includes("sock")) {
    return "Laundry";
  }
  if (lowerDesc.includes("trash") || lowerDesc.includes("recycle") || lowerDesc.includes("garbage")) {
    return "Trash";
  }

  return "Chores";
}
