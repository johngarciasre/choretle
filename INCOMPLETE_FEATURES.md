# Incomplete Features — Choretle

A living inventory of stubbed-out features, missing APIs, mock data, and known gaps. Updated Aug 26, 2026.

---

## ✅ COMPLETED (Resolved)

### 1. Reports API queries ~~(was HIGH)~~
**File:** `src/app/api/reports/route.ts` — **FIXED**
All four stubbed generators (`getDoneReport`, `getTaskReport`, `getMemberReport`, `getWallboardReport`) now query the database with real joins across `jobs`, `slate_tasks`, `tasks`, and `users`. Frontend wired up to fetch from `/api/reports?type=<tab>` on mount and tab switches.

### 2. Dashboard API ~~(was HIGH)~~
**File:** `src/app/api/dashboard/route.ts` — **FIXED**
Replaced the empty `{ jobs: [], leaderboard: [] }` stub with real DB queries. Returns today's outstanding jobs (todo/doing status, filtered by user) joined with slate task names and assigned user names, plus a leaderboard of all family members sorted by total points. Reads `x-user-id` / `x-family-id` headers set by middleware, with dev session cookie fallback.

### 3. Jobs DELETE — was no-op (now uses real DB delete)
**File:** `src/app/api/jobs/route.ts` + `src/lib/db/service.ts` — **FIXED**
Added `deleteJob()` to the DB service layer. The DELETE handler now calls `deleteJob(body.id)` and returns 404 if the job doesn't exist. Cascade cleanup of `job_subtasks`, `comments`, and `job_history` is handled by the schema's `ON DELETE CASCADE` constraints on all three child tables.

### 4. `createFamily()` / `joinFamily()` stubs — fixed
**File:** `src/app/api/family/route.ts` + `src/app/api/family/join/route.ts` — **FIXED**
The API routes were already wired to real DB operations; the dead-code stubs in `actions.ts` have been removed. Added auto-incrementing slug suffix (`my-test-family-1`, `-2`, etc.) when a family name collision occurs, preventing 409 errors on repeated creation.

### 5. Comments route — fixed
**File:** `src/app/api/jobs/[jobId]/route.ts` — **FIXED**
Added POST handler for `/api/jobs/:jobId/comments`. Verifies auth via `verifyAuth()`, validates content, checks job existence and family access, inserts into `comments` table with `rawInsert()`, returns the created comment with user name. Frontend at `src/app/jobs/[jobId]/page.tsx` already wired to call this endpoint.

### 6. Profile API + page wiring — fixed
**File:** `src/app/api/profile/[id]/route.ts` — **FIXED**
Created new GET route that returns `{ user, stats, completions }`. Queries database for user profile, calculates weekly stats (pointsThisWeek/LastWeek, streakDays, longestStreak), and fetches completed jobs with category info via joins across `jobs`, `slate_tasks`, `tasks`, and `slates` tables. Family access enforcement included. Frontend at `src/app/profile/[id]/page.tsx` already wired to call this endpoint.

---

## HIGH SEVERITY — Broken or non-functional in production

### 6. Profile page calls non-existent API
**File:** `src/app/profile/[id]/page.tsx`
Fetches from `/api/profile/${userId}` which has no route file. Falls back to hardcoded mock user/stats/completions on error.

---

## MEDIUM SEVERITY — Partially working or fragile

### 7. Jobs page — mock fallback on API failure
**File:** `src/app/jobs/page.tsx`
`fetchJobs()` catches errors and returns 3 hardcoded jobs. The real fetch doesn't pass `x-family-id` header, so this fallback triggers in production.

### 8. Rotations page — mock fallback on API failure
**File:** `src/app/rotations/page.tsx`
100+ lines of hardcoded mock users/slates/assignments as fallback when `/api/rotations` fails. Missing `x-family-id` header on the fetch.

### 9. `getJobsByFamily()` stubbed out
**File:** `src/lib/db/service.ts` (line ~305)
```ts
export async function getJobsByFamily(familyId: string) {
 const db = await ensureDb();
 if (!db) return [];
 // Stub for now — jobs don't have a direct family_id relationship
 const res = await safeQuery(
   db.select().from(schema.jobs).where({ listId: '' })
 );
 return (res as any[]) || [];
}
```

### 10. Team member DELETE missing
**File:** `src/app/api/family/[familyId]/teams/[teamId]/members/route.ts`
Only POST (add member) is implemented. No DELETE to remove a member from a team.

---

## LOW SEVERITY — Code quality / technical debt

### 12. Pervasive `any` types (275 instances)
Systemic type safety gaps, concentrated in:
- `src/lib/db/service.ts` — 60+ casts as `(res as any[]) || []`
- `src/lib/rotation.ts` — 8 uses
- `src/db/drizzle.ts` — 6 uses
- `src/lib/points.ts` — 3 uses

### 13. localStorage for familyId (17 instances)
Family ID stored in client-side localStorage instead of derived from session/middleware headers. Appears in:
- `src/app/reviews/page.tsx`
- `src/app/swap-meet/page.tsx`
- `src/app/slates/page.tsx`
- `src/app/family/FamilyPage.tsx`

### 14. `debug()` is a no-op stub
**File:** `src/lib/logger.ts`
```ts
const debug = () => {};
```

---

## Suggested order of work

| Priority | Item | Why |
|----------|------|-----|
| 1 | **Remove mock fallbacks** (#7, #8) | Cleanup after APIs are solid |
| 2 | **getJobsByFamily() fix** (#9) | Stubbed out query needs real implementation |
| 3 | **Team member DELETE** (#10) | Missing CRUD operation |
| 4 | **Type safety pass** (#12) | Worth doing once real queries replace stubs |
