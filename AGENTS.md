# Choretle - Project Status

## Objective
Complete Choretle's core workflow, auto-generation, and scoring logic while enabling a seamless local SQLite fallback for development without requiring PostgreSQL/Supabase setup.

## Important Details
- Next.js 16.3.1 with App Router, Turbopack (default), TypeScript, Tailwind CSS, Drizzle ORM, and Vitest.
- Hybrid database strategy: uses `DATABASE_URL` env var for PostgreSQL (`postgres-js`) or falls back to in-memory SQLite via `better-sqlite3`.
- Native addon resolution issue resolved: `better-sqlite3` native bindings are now properly excluded from client-side bundling by using dynamic imports and API-only server code paths.
- All database initialization logic moved into `src/db/drizzle.ts` with lazy `initDb()` export to prevent top-level module evaluation in client components.

## Work State

### Completed ✅
- **Unit Testing Suite**: 101 passing tests across 5 files (utilities, slug gen, rotation math, slate filtering, points calc, job status transitions).
- **Slate-to-List Auto-Generation**: `slateAutoGen.ts`, `rotation.ts`, `points.ts` with interval-based list generation.
- **Task Workflow Enforcement**: `jobStatus.ts` and `subtask.ts` enforce state transitions (`todo → doing → done`), history tracking, and point awarding.
- **Rotation UI**: Drag-and-drop assignment board (`RotationBoard.tsx`, `AssignmentCard.tsx`) with HTML5 drag API and responsive layout.
- **Scoring Display**: `Leaderboard.tsx`, dashboard cards, and user profile views with streaks/progress bars.
- **Hybrid DB Architecture**: `src/db/drizzle.ts` now uses lazy initialization pattern; `next.config.ts` simplified (removed invalid experimental options).
- **Build Success**: `npm run build` completes successfully with Turbopack after moving all server-side DB logic to API routes and using dynamic imports in client components.
- **Database Service Layer**: `src/lib/db/service.ts` rewritten with consistent lazy initialization pattern for all database operations.
- **Repository Setup**: Both `main` and `production` branches pushed to GitHub (https://github.com/johngarciasre/choretle.git).

### Active 🚧
- Verifying local SQLite fallback by mocking schema execution and testing API route fallbacks against in-memory instance.
- Ensuring no client component statically or dynamically imports from `src/lib/db/service.ts` (all calls now routed via `/api/*` endpoints).

### Blocked ❌
- "(none)"

## Next Steps
1. Test local development flow with `DATABASE_URL` unset to confirm SQLite fallback works end-to-end.
2. Verify API routes correctly initialize the database on first request and persist data across requests.
3. Add integration tests for critical API flows (auth, job creation, scoring).
4. Implement missing error handling in API routes.

## Relevant Files
- `src/db/drizzle.ts`: Lazy DB initialization with PostgreSQL/SQLite drivers and schema creation
- `next.config.ts`: Minimal config ensuring native modules are not bundled for client components
- `src/lib/db/service.ts`: Server-only service layer (only used via API routes)
- `src/app/api/*/*/route.ts`: All database operations now go through these server-only endpoints
