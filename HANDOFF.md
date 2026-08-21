# Choretle Project Handoff Notes

## Current State (as of Aug 20, 2026)

### Repository
- **URL**: https://github.com/johargarciasre/choretle.git
- **Branches**: `main` and `production` both pushed to origin
- **Owner**: johngarciasre (GitHub)
- **Active user accounts**: johngarciasre & assimilative-john (both authenticated via `gh auth`)

### Tech Stack
- **Framework**: Next.js 16.3.1 (App Router, Turbopack default bundler)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **ORM**: Drizzle ORM v0.45.2
- **Database**: Hybrid strategy
  - PostgreSQL via `postgres-js` when `DATABASE_URL` env var is set
  - In-memory SQLite via `better-sqlite3` as fallback (local dev)
- **Testing**: Vitest (114 tests, all passing)

### Architecture Overview
```
src/
├── app/
│   ├── page.tsx                          # Home page
│   ├── api/                              # API routes (all server-only)
│   │   ├── auth/signin/route.ts          # Sign in endpoint
│   │   ├── auth/signup/route.ts          # Sign up endpoint
│   │   ├── dashboard/route.ts            # Dashboard data
│   │   ├── family/route.ts               # Family CRUD
│   │   ├── family/join/route.ts          # Join family via code
│   │   ├── jobs/route.ts                 # Job CRUD
│   │   ├── reports/route.ts              # Reports
│   │   ├── schedules/generate/route.ts   # Auto-generate jobs from slates
│   │   ├── swap-meet/route.ts            # Swap/rotate assignments
│   │   ├── tasks/route.ts                # Task CRUD
│   │   └── tasks/subtasks/route.ts       # Subtask management
│   ├── auth/signin/page.tsx              # Sign in page
│   ├── auth/signup/page.tsx              # Sign up page
│   ├── dashboard/page.tsx                # Dashboard view
│   ├── family/page.tsx                   # Family settings
│   ├── jobs/[jobId]/page.tsx             # Job detail page
│   ├── profile/[id]/page.tsx             # User profile
│   ├── reports/page.tsx                  # Reports view
│   ├── rotations/page.tsx                # Rotation board
│   ├── swap-meet/page.tsx                # Swap assignments UI
│   └── tasks/[taskId]/page.tsx           # Task detail page
├── components/
│   ├── AssignmentCard.tsx                # Drag-drop assignment card
│   ├── Leaderboard.tsx                   # Points leaderboard
│   └── RotationBoard.tsx                 # Rotation board with drag-drop
├── db/
│   ├── drizzle.ts                        # DB initialization (lazy pattern)
│   ├── schema.ts                         # Drizzle schema definitions (PostgreSQL types)
│   └── schema-sqlite.sql                 # SQLite DDL (for local fallback)
└── lib/
    ├── rotation.ts                       # Pure rotation assignment logic
    ├── rotation.test.ts                  # Tests for rotation functions
    ├── slateAutoGen.ts                   # Slate-to-list job generation
    ├── points.ts                         # Points calculation
    ├── jobStatus.ts                      # Job status transition enforcement
    ├── subtask.ts                        # Subtask management
    └── db/service.ts                     # Server-side DB operations
```

### Key Components & Files
1. **`src/db/drizzle.ts`** — Lazy DB initialization. Exports `initDb()` async function and `db` variable (null until initialized). Handles both PostgreSQL and SQLite fallback.
2. **`src/lib/db/service.ts`** — Server-only service layer with lazy `ensureDb()` pattern for all operations. Re-exports `canTransition`, `getValidNextStatuses`, and `calculateJobPoints`.
3. **`src/lib/rotation.ts`** — Pure functions: `getRotationForDate()`, `calculateRotationAssignment()`, `getRotationSchedule()`, `canSwapRotations()`, `swapRotations()`, `getUpcomingAssignments()`.
4. **`src/lib/slateAutoGen.ts`** — Auto-generates jobs from slates using rotation assignment logic. Calls `autoGenerateJobs()` which iterates active slates and creates jobs per user based on their rotation position.
5. **`src/app/api/schedules/generate/route.ts`** — POST endpoint that triggers `autoGenerateJobs()` for a family on a target date.

### How Rotation Works
1. Each **slate** has associated **rotations** (user assignments with order + intervalDays).
2. For a given slate and date, `getRotationForDate()` determines which user is assigned by:
   - Filtering active rotations for the slate
   - Using earliest createdAt as reference start date
   - Calculating days elapsed → cycle count → index into sorted rotations array
3. `calculateRotationAssignment()` maps slate tasks to users based on rotation assignment.
4. Jobs are created with `assignedTo` set to the assigned user via rotation logic.

### How Auto-Generation Works
1. User calls `/api/schedules/generate` POST with familyId and targetDate.
2. `autoGenerateJobs()` fetches all active slates for the family.
3. For each slate:
   - Gets slate tasks and rotations from DB
   - If rotations exist: uses `calculateRotationAssignment()` to map tasks → users
   - Creates jobs with `assignedTo` set; if no rotations, creates unassigned jobs
4. Jobs are created with status "todo" and due date = targetDate.

### How Swapping Works
1. User calls `/api/swap-meet` POST with familyId, slateId, rotationId1, rotationId2.
2. Validates swap using `canSwapRotations()` (same slate, different users).
3. Uses `swapRotationEntries()` in service.ts to swap order values in DB.
4. Creates history entry for audit trail.

### Build & Test
- **Build**: `npm run build` — compiles with Turbopack, all routes registered.
- **Test**: `npm test` — 114 tests passing across 5 files (utils, rotation, jobStatus, subtask, points).
- **Dev server**: `npm run dev` — runs on port 3000 by default.

### Known Issues / Gaps
1. **Middleware redirect bug** — Fixed: changed relative URL to absolute URL using `new URL("/auth/signin", request.url)`.
2. **DB service types** — All functions use `any` for query results due to Drizzle's limited type inference with SQLite fallback.
3. **Swap UI incomplete** — The swap-meet page has placeholder inputs; needs real form integration with rotation IDs.
4. **No auth middleware enforcement** — Routes currently accept any request without authentication checks.
5. **SQLite in-memory only** — Data doesn't persist across requests during development (by design).

### Next Steps
1. **Integration tests** — Add tests for API routes (auth, job creation, scoring) using SQLite fallback.
2. **Error handling** — Add try/catch and proper error responses to all API routes.
3. **Auth middleware** — Implement JWT/session-based auth enforcement on protected routes.
4. **Swap UI completion** — Connect swap-meet page inputs to actual rotation data (fetch available rotations, pre-populate user list).
5. **Persistence** — Add SQLite file storage for local dev (replace `:memory:` with a temp file).
6. **Deployment** — Configure Supabase/PostgreSQL connection string for production deployment.

### Commands Reference
```bash
npm run build          # Production build
npm run dev            # Development server
npm test               # Run tests
npm run lint           # Lint check (if configured)
gh auth status         # Check GitHub CLI auth
git push origin main   # Push to remote
```

### Key Dependencies
- next@16.3.1
- drizzle-orm@0.45.2
- postgres-js (dynamic import for PostgreSQL)
- better-sqlite3@^13.0.3 (native addon excluded from client-side)
- vitest (testing)

### Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (optional, unset = SQLite fallback)
