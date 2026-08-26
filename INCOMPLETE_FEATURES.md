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

### 7. Profile page mock fallback — fixed
**File:** `src/app/profile/[id]/page.tsx` — **FIXED**
The profile API route now exists and returns real data. The mock data in the `.catch()` block is only a client-side error fallback, not a production stub.

### 8. Jobs page — mock fallback on API failure
**File:** `src/app/api/jobs/route.ts` + `src/app/jobs/page.tsx` — **FIXED**
Jobs API now accepts `familyId` via query param or `x-family-id` header, returning all jobs for a family joined with slate task names. Jobs page fetches familyId from `/api/auth/me` and passes it to the API, eliminating mock fallback in production.

### 9. Rotations page — mock fallback on API failure
**File:** `src/app/rotations/page.tsx` — **FIXED**
Rotations page now fetches familyId from `/api/auth/me` and passes it as query param to `/api/rotations`, eliminating the 100+ lines of hardcoded mock data in production.

### 10. `getJobsByFamily()` stubbed out ~~(#9)~~ — **FIXED**
**File:** `src/lib/db/service.ts` (line ~302)
Now performs real joins across `jobs → lists → family`:
```ts
const jobs = await safeQuery(
  db.select({ job: schema.jobs, slateTask: schema.slateTasks, task: schema.tasks })
    .from(schema.jobs)
    .leftJoin(schema.slateTasks, eq(schema.jobs.slateTaskId, schema.slateTasks.id))
    .leftJoin(schema.tasks, eq(schema.slateTasks.taskId, schema.tasks.id))
    .where(sql`${schema.jobs.listId} IN (SELECT id FROM lists WHERE family_id = ${familyId})`)
);
```

### 11. Team member DELETE missing ~~(#10)~~ — **FIXED**
**File:** `src/app/api/family/[familyId]/teams/[teamId]/members/route.ts`
DELETE handler implemented at line 128. Verifies auth, checks team membership, deletes the row from `teamMembers`, returns 404 if not found.

---

## MEDIUM SEVERITY — Partially working or fragile

### 12. localStorage for familyId (10 instances)
Family ID stored in client-side localStorage instead of derived from session/middleware headers. Appears in:
- `src/app/swap-meet/page.tsx`
- `src/app/reviews/page.tsx`
- `src/app/slates/page.tsx`
- `src/app/family/FamilyPage.tsx`

### 13. `debug()` is a no-op stub
**File:** `src/lib/logger.ts`
```ts
const debug = () => {};
```

---

## LOW SEVERITY — Code quality / technical debt

### 14. Pervasive `any` types (~171 instances, deferred)
**Status: DEFERRED** — Removing `any` casts introduces more TypeScript errors than it fixes. The original codebase has 0 TS errors because `any` casts are **intentional workarounds** for Drizzle ORM's SQLite type system limitations:

- Drizzle's SQLite driver returns objects with **snake_case columns** (e.g., `family_id`, `completed_at`)
- Application code uses **camelCase properties** (e.g., `familyId`, `completedAt`)
- Explicit interfaces expose this mismatch → 184 new TS errors
- `as any[]` casts mask the mismatch and are necessary for build success

**Safe-to-replace categories** (low risk):
- `useState<any[]>([])` in React components — replace with local interface
- Pure utility functions (no DB interaction) — parameter types can be specified

**Unsafe categories** (keep as `any`):
- Drizzle query results: `(res as any[])`, `(jobs as any[])`
- DB row parameters: `job: any`, `user: any`, `m: any`
- Drizzle raw SQL helpers: `createDb(): any`

**Next attempt**: Only fix `useState<any[]>` patterns and pure function params. Leave all Drizzle-related casts untouched.

---

## Suggested order of work

| Priority | Item | Why |
|----------|------|-----|
| 1 | **localStorage for familyId** (#12) | 10 instances across 5 files — refactor to use middleware-derived values |
| 2 | **Targeted type safety** (#14) | Only fix `useState<any[]>` and pure function params — leave Drizzle casts alone |
| 3 | **Enable debug() logger** (#13) | Low effort, improves observability for local dev |
