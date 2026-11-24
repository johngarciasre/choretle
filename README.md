# Choretle - A Chore Tracking App

A chore and habit tracking app for families — set tasks, assign to kids, track completion, earn points.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Database:** SQLite (`better-sqlite3`, single file at `SQLITE_PATH`)
- **Auth:** Supabase Auth in production, signed dev cookie locally
- **Styling:** Tailwind CSS

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Local development (no external services):
   ```
   AUTH_MODE=dev
   SQLITE_PATH=./data/choretle.db
   ```
   In dev mode you sign in with any email that already exists in the local
   database (`npm run dev`, then create one via the signup screen).

3. Or production mode: set `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and **do not** set `AUTH_MODE`. `WEBSUDO_SECRET`
   is required for websudo elevation.

4. Start the dev server:
   ```bash
   npm run dev
   ```

## Project Structure

```
├── src/app/          # Next.js App Router pages + API routes
│   ├── api/          # Server-side API endpoints
│   ├── auth/         # Authentication pages
│   └── ...           # Feature pages (dashboard, tasks, jobs, etc.)
├── src/db/           # SQLite client, schema and runtime migrations
├── src/lib/          # Utilities and domain logic
└── k8/               # Kubernetes manifests (SQLite on a PVC, one replica)
```

## Database

The runtime database is SQLite. Tables and indexes are created at startup by
`src/db/drizzle.ts`, which also applies small `ALTER TABLE` migrations for
columns added over time. Every deployment needs a persistent volume for
`SQLITE_PATH`; an in-memory database (the fallback) loses everything on restart.
SQLite serves one process, so keep `replicas: 1` until a shared database replaces it.

## Current Status

All core flows are implemented: families and invites, tasks and subtasks,
slates with tag auto-inclusion, rotation assignment, schedule generation,
scoring, medals, reports, and the Swap Meet share/swap endpoints.

### Known gaps
- Supabase-mode sign-in has not been exercised against a live Supabase project.
- The Swap Meet accept/reject flow is not implemented (requests are recorded).
- RLS policies in `schema-policies.sql` apply only if you move to Postgres.

## License

Open source.

