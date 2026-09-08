#!/usr/bin/env -S node --import=tsx
/**
 * Simulate one week of typical user activity for a single family.
 *
 * Usage (from project root):
 *   npx tsx scripts/simulate-week.ts
 *
 * Requires: the Next.js dev server running on port 3000 (or set NEXT_PUBLIC_API_URL).
 *
 * What it does:
 *   Day 0 — Setup: family, parent + 2 children, tasks, slates, rotations
 *   Day 1–7 — Jobs auto-generate; children complete them; parents award points
 *
 * Output: summary of jobs created/completed and scores per user.
 */

// ── Config ───────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8081";
const START_DATE = new Date(); // today — the week starts now
const WEEK_DAYS = 7;

// ── Session helper ───────────────────────────────────────────────────

class Session {
  cookies = "";

  private parseCookies(headers: Headers) {
    const raw = headers.get("set-cookie") || "";
    for (const part of raw.split("; ")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      const name = part.substring(0, eq).trim();
      const val = part.substring(eq + 1).split(";")[0].trim();

      if (!val) {
        // Cookie being cleared — remove it
        const idx = this.cookies.indexOf(name + "=");
        if (idx === -1) continue;
        const after = this.cookies.substring(idx + name.length + 1);
        const end = after.indexOf(";");
        this.cookies = end === -1
          ? this.cookies.substring(0, idx)
          : this.cookies.substring(0, idx) + after.substring(end + 1);
      } else if (this.cookies.includes(name + "=")) {
        // Replace existing cookie
        const idx = this.cookies.indexOf(name + "=");
        const after = this.cookies.substring(idx + name.length + 1);
        const end = after.indexOf(";");
        this.cookies = this.cookies.substring(0, idx) + name + "=" + val + (end === -1 ? "; " : after.substring(end));
      } else {
        this.cookies += `${name}=${val}; `;
      }
    }
  }

  async login(email: string, password = "test") {
    await fetch(`${BASE}/api/auth/signout`, { method: "POST", headers: this.cookieHeader() });
    const res = await fetch(`${BASE}/api/auth/signin`, {
      method: "POST",
      headers: { ...this.cookieHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`Login failed for ${email}: ${await res.text()}`);
    this.parseCookies(res.headers);
  }

  async signUp(email: string, name?: string, password = "test") {
    const res = await fetch(`${BASE}/api/auth/signup`, {
      method: "POST",
      headers: { ...this.cookieHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ email, name: name || email.split("@")[0], password }),
    });
    if (!res.ok) throw new Error(`Signup failed for ${email}: ${await res.text()}`);
    this.parseCookies(res.headers);
  }

  async me() {
    const r = await fetch(`${BASE}/api/auth/me`, {
      headers: this.cookieHeader(),
    });
    return (await r.json()) as { user: { id: string; email: string; role: string }; familyId: string };
  }

  async get(path: string) {
    const r = await fetch(`${BASE}${path}`, {
      headers: this.cookieHeader(),
    });
    if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${await r.text()}`);
    return r.json();
  }

  async post(path: string, body: unknown) {
    const r = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { ...this.cookieHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${await r.text()}`);
    return r.json();
  }

  async put(path: string, body: unknown) {
    const r = await fetch(`${BASE}${path}`, {
      method: "PUT",
      headers: { ...this.cookieHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`PUT ${path} → ${r.status}: ${await r.text()}`);
    return r.json();
  }

  async del(path: string, body?: unknown) {
    const h = { ...this.cookieHeader() };
    if (body) h["Content-Type"] = "application/json";
    await fetch(`${BASE}${path}`, { method: "DELETE", headers: h, body: body ? JSON.stringify(body) : undefined });
  }

  private cookieHeader(): Record<string, string> {
    return this.cookies ? { cookie: this.cookies } : {};
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function dayOffset(n: number) {
  const d = new Date(START_DATE);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// ── Day 0: Setup ─────────────────────────────────────────────────────

async function setup() {
  console.log("━━━ Day 0 — Setup ─");

  // Ensure parent exists and has a family
  const parent = new Session();
  // Sign up the admin user first (idempotent in dev mode)
  await parent.signUp("admin@choretle.dev", "Admin");
  await parent.login("admin@choretle.dev");
  let me = await parent.me();
  let familyId = me.familyId;

  if (!familyId) {
    console.log("  Creating family...");
    const fam = await parent.post("/api/family", { name: "My Family", slug: "my-family" });
    familyId = (fam as { id: string }).id;
    me = await parent.me();
  }
  console.log(`  Family: ${familyId}`);

  // Create children if they don't exist
  const childEmails = ["child1@choretle.dev", "child2@choretle.dev"];
  const children: { email: string; id: string }[] = [];
  for (const email of childEmails) {
    const s = new Session();
    // Sign up first (idempotent in dev mode), then sign in
    await s.signUp(email);
    await s.login(email);
    const c = await s.me();
    children.push({ email, id: c.user.id });
  }
  console.log(`  Children: ${children.map((c) => c.email).join(", ")}`);

  // Create tasks (real chores)
  const taskDefs = [
    { name: "Do Laundry", points: 10, icon: "shirt" },
    { name: "Homework - Math", points: 15, icon: "book" },
    { name: "Practice Reading", points: 10, icon: "book-open" },
    { name: "Exercise Routine", points: 20, icon: "dumbbell" },
    { name: "Organize School Supplies", points: 5, icon: "folder" },
    { name: "Clean Kitchen", points: 10, icon: "broom" },
    { name: "Help with Chores", points: 8, icon: "sparkles" },
    { name: "Water the Dog", points: 5, icon: "dog" },
  ];

  const tasks: { id: string; name: string }[] = [];
  for (const t of taskDefs) {
    const created = await parent.post("/api/tasks", {
      familyId, name: t.name, points: t.points, icon: t.icon, archtype: "job", isActive: true, verifyRequired: false,
    });
    tasks.push({ id: (created as { id: string }).id, name: t.name });
  }
  console.log(`  Created ${tasks.length} tasks`);

  // Create slates (scheduled templates)
  // Use daily frequency so they generate every day of the week simulation.
  const slateDefs = [
    { name: "Morning Routine", frequency: "daily", interval: 1 },
    { name: "Homework", frequency: "daily", interval: 1 },
    { name: "Weekly Chores", frequency: "weekly", interval: 7 },
  ];

  const slates: { id: string; name: string }[] = [];
  for (const s of slateDefs) {
    const created = await parent.post("/api/slates", {
      familyId, name: s.name, frequency: s.frequency, interval: s.interval,
    });
    slates.push({ id: (created as { id: string }).id, name: s.name });
  }
  console.log(`  Created ${slates.length} slates`);

  // Assign tasks to slates
  const slateTaskAssignments: [string, string][] = [];
  // Morning Routine → Laundry, Exercise, Water Dog
  slateTaskAssignments.push([slates[0].id, tasks[0].id]); // Laundry
  slateTaskAssignments.push([slates[0].id, tasks[3].id]); // Exercise
  slateTaskAssignments.push([slates[0].id, tasks[7].id]); // Water Dog
  // Homework → Homework-Math, Reading
  slateTaskAssignments.push([slates[1].id, tasks[1].id]); // Math
  slateTaskAssignments.push([slates[1].id, tasks[2].id]); // Reading
  // Weekly Chores → Kitchen, Organize, Help
  slateTaskAssignments.push([slates[2].id, tasks[5].id]); // Kitchen
  slateTaskAssignments.push([slates[2].id, tasks[4].id]); // Organize
  slateTaskAssignments.push([slates[2].id, tasks[6].id]); // Help

  // Batch task assignments by slateId (PUT endpoint replaces all tasks per call)
  const assignmentsBySlate = new Map<string, string[]>();
  for (const [slateId, taskId] of slateTaskAssignments) {
    if (!assignmentsBySlate.has(slateId)) assignmentsBySlate.set(slateId, []);
    assignmentsBySlate.get(slateId)!.push(taskId);
  }

  for (const [slateId, taskIds] of assignmentsBySlate) {
    await parent.put(`/api/slates/${slateId}/tasks`, { explicitTaskIds: taskIds, autoIncludeTagIds: [] });
  }
  console.log(`  Assigned ${slateTaskAssignments.length} tasks to slates`);

  // Create rotations (which child does which slate)
  const rotationDefs = [
    { slateId: slates[0].id, userId: children[0].id }, // child1 → Morning Routine
    { slateId: slates[1].id, userId: children[1].id }, // child2 → Homework
    { slateId: slates[2].id, userId: children[0].id }, // child1 → Weekly Chores (Mon)
  ];

  for (const r of rotationDefs) {
    console.log(`   Creating rotation: slateId=${r.slateId}, userId=${r.userId}`);
    await parent.post("/api/rotations", {
      familyId, slateId: r.slateId, userId: r.userId, order: 0, intervalDays: 1, isActive: true,
    });
  }
  console.log(`  Created ${rotationDefs.length} rotations`);

  // Store IDs for later use
  return { familyId, children, slates, tasks };
}

// ── Days 1–7: Simulate activity ──────────────────────────────────────

async function simulateWeek(weekData: Awaited<ReturnType<typeof setup>>) {
  console.log("\n━━━ Days 1–7 — Activity Simulation ─");

  const { familyId, children } = weekData;

  // Parent generates jobs for each day of the week
  const parent = new Session();
  await parent.login("admin@choretle.dev");

  const allJobs: { id: string; name: string; assignedTo: string; completed: boolean }[] = [];

  for (let day = 0; day < WEEK_DAYS; day++) {
    const dateStr = dayOffset(day);
    console.log(`\n  Day ${day + 1} (${dateStr}):`);

    // Generate jobs for this day
    const genResRaw = await fetch(`${BASE}/api/schedules/generate`, {
      method: "POST",
      headers: { ...parent.cookieHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ familyId, date: dateStr }),
    });
    const genRes = await genResRaw.json();
    if (!genResRaw.ok) {
      console.log(`   ⚠ Generate error: ${JSON.stringify(genRes)} (status ${genResRaw.status})`);
      continue;
    }
    const newJobs = Array.isArray(genRes) ? genRes : (genRes as { jobs?: unknown[] }).jobs || [];

    if ((newJobs as unknown[]).length === 0) {
      console.log("    No jobs generated");
      continue;
    }

    // Assign and complete jobs
    for (const job of newJobs as { id: string; name: string; assigned_to?: string }[]) {
      const assignedTo = job.assigned_to || children[day % children.length].id;

      // Mark as "doing" then "done"
      try {
        await parent.put(`/api/jobs/${job.id}`, { status: "doing" });
      } catch {
        /* ignore */
      }

      const doneRes = await parent.put(`/api/jobs/${job.id}`, { status: "done" });
      allJobs.push({
        id: job.id,
        name: job.name,
        assignedTo,
        completed: true,
      });
    }

    console.log(`    Generated & completed ${(newJobs as unknown[]).length} jobs`);
  }

  // Summary
  const totalPoints = allJobs.length * 10; // rough estimate
  console.log("\n━━━ Week Summary ─");
  console.log(`   Total jobs created: ${allJobs.length}`);
  console.log(`   Total jobs completed: ${allJobs.filter((j) => j.completed).length}`);
  console.log(`   Estimated points awarded: ~${totalPoints}`);

  // Fetch final scores
  for (const child of children) {
    const profile = await parent.get(`/api/profile/${child.id}`);
    const score = ((profile as { user?: { pointsTotal?: number } }).user?.pointsTotal ?? 0) || 0;
    console.log(`   ${child.email}: ${score} points`);
  }

  return allJobs;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("Choretle — Simulating one week of activity\n");
  console.log(`Start date: ${START_DATE.toISOString().split("T")[0]}\n`);

  try {
    const weekData = await setup();
    await simulateWeek(weekData);
    console.log("\n✅ Simulation complete.\n");
  } catch (err) {
    console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

main();
