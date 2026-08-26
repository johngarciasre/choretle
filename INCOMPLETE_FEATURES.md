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

---

## HIGH SEVERITY — Broken or non-functional in production

### 3. `createFamily()` / `joinFamily()` stubs
**File:** `src/lib/server/actions.ts`
Both functions return `{ id: crypto.randomUUID(), name }` without touching the database. The server action layer is entirely non-functional for family creation/joining.

### 4. Jobs DELETE — no-op (returns success without deleting)
**File:** `src/app/api/jobs/route.ts`
The DELETE handler does a nonsensical dynamic import, gets `null`, then returns `{ ok: true, deleted: body.id }`. No database deletion or cascade cleanup of `job_subtasks`, `comments`, or `job_history`.

### 5. Profile page calls non-existent API
**File:** `src/app/profile/[id]/page.tsx`
Fetches from `/api/profile/${userId}` which has no route file. Falls back to hardcoded mock user/stats/completions on error.

---

## MEDIUM SEVERITY — Partially working or fragile

### 6. Jobs page — mock fallback on API failure
**File:** `src/app/jobs/page.tsx`
`fetchJobs()` catches errors and returns 3 hardcoded jobs. The real fetch doesn't pass `x-family-id` header, so this fallback triggers in production.

### 7. Rotations page — mock fallback on API failure
**File:** `src/app/rotations/page.tsx`
100+ lines of hardcoded mock users/slates/assignments as fallback when `/api/rotations` fails. Missing `x-family-id` header on the fetch.

### 8. Missing: `/api/profile/:id` route
Referenced by `src/app/profile/[id]/page.tsx` but no route file exists under `src/app/api/profile/`.

### 9. Missing: `/api/jobs/:jobId/comments` route
Referenced by `src/app/jobs/[jobId]/page.tsx` (POST to add comments) but no route file exists.

### 10. `getJobsByFamily()` stubbed out
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

### 11. Team member DELETE missing
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
| 1 | **Jobs DELETE fix** (#4) | Small but critical — currently a lie to callers |
| 2 | **Comments route** (#9) | Wired up by job detail page, straightforward CRUD |
| 3 | **Profile API + page wiring** (#5, #8) | Two missing pieces that belong together |
| 4 | **Server actions fix** (#3) | Family creation/joining is core workflow |
| 5 | **Remove mock fallbacks** (#6, #7) | Cleanup after APIs are solid |
| 6 | **Type safety pass** (#12) | Worth doing once real queries replace stubs |
