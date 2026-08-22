# Choretle - Project Status (Updated Aug 20, 2026)

## Objective
Complete Choretle's core workflow, auto-generation, and scoring logic while enabling a seamless local SQLite fallback for development without requiring PostgreSQL/Supabase setup.

## Important Details
- Next.js 16.3.1 with App Router, Turbopack (default), TypeScript, Tailwind CSS, Drizzle ORM, and Vitest.
- Hybrid database strategy: uses `DATABASE_URL` env var for PostgreSQL (`postgres-js`) or falls back to in-memory SQLite via `better-sqlite3`.
- Native addon resolution issue resolved: `better-sqlite3` native bindings are now properly excluded from client-side bundling by using dynamic imports and API-only server code paths.
- All database initialization logic moved into `src/db/drizzle.ts` with lazy `initDb()` export to prevent top-level module evaluation in client components.
- **Supabase Auth** is now the primary authentication system (migrated from custom JWT).

## Work State

### Completed ✅
- **Unit Testing Suite**: 127 passing tests across 6 files (utilities, slug gen, rotation math, slate filtering, points calc, job status transitions, integration tests).
- **Slate-to-List Auto-Generation**: `slateAutoGen.ts`, `rotation.ts`, `points.ts` with interval-based list generation.
- **Task Workflow Enforcement**: `jobStatus.ts` and `subtask.ts` enforce state transitions (`todo → doing → done`), history tracking, and point awarding.
- **Rotation UI**: Drag-and-drop assignment board (`RotationBoard.tsx`, `AssignmentCard.tsx`) with HTML5 drag API and responsive layout.
- **Scoring Display**: `Leaderboard.tsx`, dashboard cards, and user profile views with streaks/progress bars.
- **Hybrid DB Architecture**: `src/db/drizzle.ts` now uses lazy initialization pattern; `next.config.ts` simplified (removed invalid experimental options).
- **Build Success**: `npm run build` completes successfully with Turbopack after moving all server-side DB logic to API routes and using dynamic imports in client components.
- **Database Service Layer**: `src/lib/db/service.ts` rewritten with consistent lazy initialization pattern for all database operations.
- **Repository Setup**: Both `main` and `production` branches pushed to GitHub (https://github.com/johngarciasre/choretle.git).
- **Reports API**: Implemented 5 report types (daily, done, task, member, wallboard) with real data queries via Drizzle ORM.
- **Swap Meet Marketplace**: GET returns rotation schedule; POST allows families to share slates via `swap_meet` table entries.
- **User Profile View**: Fetches user's assigned slates, active lists, current score, completed jobs with category info and streaks.
- **Task/Job View Details**: Task view shows name/details/status change affordance/comments/history; Job view shows truncated task info with workflow controls and auto-point awarding on completion.
- **Auth Middleware Enforcement**: Supabase Auth middleware properly enforces JWT/session tokens on `/api/*` routes (returns 401 for unauthenticated requests).
- **Swap UI Completion**: Rotation dropdowns wired to real API data; share slate functionality added with modal; POST creates `swap_meet` entries.
- **Team Management UI/API**: Teams can be created/assigned users/toggled; API endpoints for team creation, member assignment, and family settings updates.
- **Auth Migration (Custom JWT → Supabase Auth)**: Custom HMAC-based JWT system (`src/lib/auth.ts`) removed. Created `src/lib/supabase.ts` with Edge-compatible middleware client using `@supabase/ssr`. Updated signin/signup routes to use Supabase Auth API. Added signout route. Middleware verifies Supabase sessions and sets `x-user-id` header.

### Active 🚧
- None at this time — all HANDOFF.md next steps are complete.

### Blocked ❌
- "(none)"

## Next Steps
1. **Testing**: Add more integration tests for new API routes (reports, profiles, task details) if needed.
2. **Supabase Deployment**: Set up Supabase project with real PostgreSQL database and configure `.env.local` credentials.
3. **Email Verification & Magic Links**: Enable email confirmation flows in Supabase dashboard as desired.
4. **Feature Expansion**: Add more views/reports or integrations based on user feedback.

## Relevant Files
- `src/db/drizzle.ts`: Lazy DB initialization with PostgreSQL/SQLite drivers and schema creation
- `next.config.ts`: Minimal config ensuring native modules are not bundled for client components
- `src/lib/db/service.ts`: Server-only service layer (only used via API routes)
- `src/lib/supabase.ts`: Supabase Auth setup with Edge-compatible middleware client
- `src/middleware.ts`: Supabase session verification, sets x-user-id/x-family-id headers
- `src/app/api/*/*/route.ts`: All database operations now go through these server-only endpoints
