# Choretle - A Chore Tracking App

A chore and habit tracking app for families — set tasks, assign to kids, track completion, earn points.

## Tech Stack

- **Framework:** Next.js (App Router) + Vercel
- **Database:** Supabase (PostgreSQL)
- **ORM:** Drizzle ORM
- **Styling:** Tailwind CSS
- **Auth:** Supabase Auth

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up your Supabase project and configure the environment variables in `.env.local`.

3. Start the dev server:
   ```bash
   npm run dev
   ```

## Project Structure

```
├── src/app/          # Next.js App Router pages + API routes
│   ├── api/          # Server-side API endpoints (stubbed)
│   ├── auth/         # Authentication pages
│   └── ...           # Feature pages (dashboard, tasks, jobs, etc.)
├── src/db/           # Drizzle ORM schema and client
├── src/lib/          # Utilities and server actions
├── public/           # Static assets
└── PROJECT_PLAN.md   # Full project spec
```

## Data Model (Drizzle ORM)

All data models are defined in `src/db/schema.ts`:

- **Families** → Families/Orgs that contain users, teams, tasks
- **Users** → Parents (admin) and children (normal role)
- **Teams** → Sub-groups within a family that can compete
- **Tasks/Subtasks** → Units of work with point values
- **Slates** → Templates for recurring task sets
- **Lists** → Generated from Slates for a specific period (day/week)
- **Jobs** → Assigned work items with Todo→Doing→Done workflow
- **Comments/History** → Task and job activity tracking
- **Reports** → Daily, done, task, and member scoring reports
- **Rotations** → User-to-slate assignment scheduling
- **Swap Meet** → Marketplace for sharing slates between families

## Current Status

The app is scaffolded with all major pages and API routes. All data operations are stubbed with mock data until Supabase integration is completed.

### Completed Features (Phase 1 & 2)
- ✅ Next.js project setup with TypeScript + Tailwind CSS
- ✅ Drizzle ORM schema for all data models
- ✅ Auth pages (sign in, sign up)
- ✅ Dashboard with outstanding jobs, recent completions, leaderboard
- ✅ Task and Job detail pages with status management
- ✅ Family creation and join flow
- ✅ Reports page with tab navigation and wallboard
- ✅ Swap Meet marketplace placeholder
- ✅ API routes for all endpoints (stubbed)

### Remaining Work
- [ ] Supabase integration (database setup, auth configuration)
- [ ] Replace stubbed API routes with real Drizzle ORM queries
- [ ] Implement job assignment and rotation logic
- [ ] Add real-time wallboard updates
- [ ] Complete Swap Meet marketplace functionality
- [ ] Responsive design polish
- [ ] Deployment configuration

## License

Open source.
