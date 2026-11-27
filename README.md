# Choretle - A Chore Tracking App

A chore and habit tracking app for households — set tasks, assign them, track completion, earn points. Built to run as a service for many unrelated households.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Database:** Postgres (`pg` in production and dev, PGlite in tests)
- **Auth:** Supabase Auth for adults; children sign in with a picture PIN
- **Styling:** Tailwind CSS

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start Postgres and apply migrations:
   ```bash
   docker compose up -d postgres
   DATABASE_URL=postgres://choretle:choretle@localhost:5432/choretle npm run db:migrate
   ```

3. Local development (no external auth service):
   ```
   AUTH_MODE=dev
   DATABASE_URL=postgres://choretle:choretle@localhost:5432/choretle
   ```
   In dev mode you sign in with any email that exists in the database, and any
   password. `AUTH_MODE=dev npm run seed` fills in the demo households.

4. Or production mode: set `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and **do not** set `AUTH_MODE`. `WEBSUDO_SECRET`
   is required for websudo elevation.

5. Start the dev server:
   ```bash
   npm run dev
   ```

The whole stack (Postgres, migrations, app) also runs in containers:

```bash
docker compose up -d
```

## Project Structure

```
├── src/app/                # Next.js App Router pages + API routes
│   ├── api/                # Server-side API endpoints
│   ├── profiles/           # Shared-tablet profile picker and kiosk
│   ├── enroll/             # QR device enrolment landing page
│   └── ...                 # Feature pages (dashboard, tasks, jobs, etc.)
├── src/db/                 # Postgres client (pg + PGlite) and migration loader
├── src/lib/                # Utilities, sessions, PINs, tenancy
├── db/migrations/          # Numbered SQL migrations
└── deploy/helm/choretle/   # Helm chart (bundled or external Postgres)
```

## Database

Postgres is the only runtime database. Schema changes are numbered SQL files in
`db/migrations`, applied by `npm run db:migrate` — as an init step, never from a
request path. Tests run against PGlite, a real Postgres compiled to wasm, so they
need no container.

- **Tenancy:** the household is the tenant. People are identities; `memberships`
  carry the role and the points, so one person can belong to more than one
  household with a different role in each.
- **Cross-household reports:** `household_links`, two-sided and revocable, share
  aggregates only — never chores, comments or photos.
- **Children:** under-13 accounts have no email and no Supabase identity; they
  sign in with a four-emoji PIN on a picker or an enrolled device.

## Deploying

- **One droplet, k3s:** `helm install choretle deploy/helm/choretle` with
  `postgres.enabled=true` bundles Postgres on a local-path volume, runs
  migrations as a pre-upgrade Job and takes a nightly `pg_dump`.
- **External database:** set `postgres.enabled=false` and `postgres.url`.

## Current Status

All core flows are implemented: households and invites, memberships, tasks and
subtasks, slates with tag auto-inclusion, rotation assignment, schedule
generation, scoring, medals, reports, Swap Meet, PIN sign-in with device
enrolment, and kiosk endpoints.

### Known gaps
- Supabase-mode sign-in has not been exercised against a live Supabase project.
- The Swap Meet accept/reject flow is not implemented (requests are recorded).
- Row-level security is enforced per household (`db/migrations/002_rls.sql`); the
  remaining work is performance, since each statement opens its own tenant
  transaction.

## License

Open source.
