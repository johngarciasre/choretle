#!/usr/bin/env -S node --import=tsx
/**
 * Clear all database tables and client-side cache for a fresh start.
 *
 * Usage (from project root):
 *   npx tsx scripts/clear-db.ts
 *
 * Requires: the Next.js dev server running on port 8081 (or set NEXT_PUBLIC_API_URL).
 *
 * This script:
 *   1. Signs in as admin@choretle.dev (dev mode)
 *   2. Ensures a family exists
 *   3. Deletes all resources via API routes (tasks, slates, tags, jobs, teams, etc.)
 *   4. Signs out
 *   5. Prints localStorage keys to clear in the browser console
 */

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8081";

// ── Cookie jar (Node.js fetch doesn't persist cookies) ─────────────

let cookieJar = "";

function setCookie(name: string, value: string) {
  if (!value) {
    // Empty value means the cookie is being cleared — remove it
    const idx = cookieJar.indexOf(name + "=");
    if (idx === -1) return;
    const after = cookieJar.substring(idx + name.length + 1);
    const end = after.indexOf(";");
    if (end === -1) cookieJar = cookieJar.substring(0, idx);
    else cookieJar = cookieJar.substring(0, idx) + after.substring(end + 1);
    return;
  }
  // Remove existing value first, then append
  const idx = cookieJar.indexOf(name + "=");
  if (idx !== -1) {
    const after = cookieJar.substring(idx + name.length + 1);
    const end = after.indexOf(";");
    if (end === -1) cookieJar = cookieJar.substring(0, idx) + value + "; ";
    else cookieJar = cookieJar.substring(0, idx) + value + after.substring(end);
  } else {
    cookieJar += `${name}=${value}; `;
  }
}

function extractSetCookie(headers: Headers): void {
  const raw = headers.get("set-cookie") || "";
  for (const part of raw.split("; ")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.substring(0, eq).trim();
    const val = part.substring(eq + 1).split(";")[0].trim();
    if (name) setCookie(name, val);
  }
}

// ── API helper ──────────────────────────────────────────────────────

async function api(path: string, method = "GET", body?: unknown) {
  const headers: Record<string, string> = {};
  if (cookieJar) headers["cookie"] = cookieJar;
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  extractSetCookie(res.headers);

  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  const ct = res.headers.get("content-type") || "";
  return ct.includes("json") ? res.json() : {};
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("🧹 Choretle — clearing database and cache\n");

  // Step 1: Sign in as the admin user to get family context
  console.log("Signing in...");
  try { await api("/api/auth/signout", "POST"); } catch { /* ignore */ }
  await api("/api/auth/signin", "POST", { email: "admin@choretle.dev", password: "test" });

  const me = (await api("/api/auth/me", "GET")) as { familyId: string };
  if (!me?.familyId) {
    console.log("  No family found. Creating one...");
    const fam = await api("/api/family", "POST", { name: "Demo Family", slug: "demo" });
    console.log(`   Created family ${fam.id}`);
  }

  // Step 2: Delete all resources via API routes
  async function deleteAll(path: string, idField = "id") {
    const base = path.split("?")[0];
    const items = await api(path) as unknown[];
    if (!Array.isArray(items)) return;
    for (const item of items) {
      const id = (item as Record<string, unknown>)[idField];
      if (!id) continue;
      try {
        if (base === "/api/slates") await api(`/api/slates/${id}`, "DELETE");
        else if (["/api/tags", "/api/tasks", "/api/jobs", "/api/teams"].includes(base))
          await api("/api/tags", "DELETE", { id });
        else if (base === "/api/family/join")
          await api(`/api/family/join/${id}`, "DELETE");
      } catch (err) {
        console.log(`   ⚠ ${base}/${id}: ${(err as Error).message}`);
      }
    }
  }

  const famPath = "/api/family/join?familyId=" + me.familyId;
  const teamsPath = "/api/teams?familyId=" + me.familyId;

  console.log("Deleting resources...");
  for (const p of ["/api/photos", "/api/reviews", "/api/rotations", "/api/slates", "/api/tags", "/api/tasks", famPath, "/api/jobs", teamsPath]) {
    try { await deleteAll(p); } catch (err) { console.log(`   ⚠ ${p}: ${(err as Error).message}`); }
  }

  // Step 3: Sign out
  try { await api("/api/auth/signout", "POST"); } catch { /* ignore */ }

  console.log("\n✅ Database cleared.\n");
  console.log("Browser localStorage keys to clear (run in DevTools console):");
  for (const k of ["familyId", "choretle_mode", "choretle_remember_email", "choretle_saved_email", "choretle_debug"]) {
    console.log(`  localStorage.removeItem("${k}");`);
  }
  console.log("\nThen reload the page for a clean start.");
}

main().catch((err) => { console.error("❌", err.message); process.exit(1); });
