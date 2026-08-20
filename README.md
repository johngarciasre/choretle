# Choretle - A Chore Tracking App

A chore and habit tracking app for families — set tasks, assign to kids, track completion, earn points.

## Tech Stack

- **Framework:** Next.js (App Router) + Vercel
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Styling:** Tailwind CSS

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up your Supabase project:
   - Create a new project at https://supabase.com
   - Copy the connection string and API keys
   - Add them to `.env.local` (see below)
   - Run the migrations from `src/db/schema.ts` on your Supabase SQL editor

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

## Supabase Setup (Coming Soon)

Once you've created your Supabase project, update `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
DATABASE_URL=postgresql://your-supabase-postgres-url
```

## Current Status

The app is scaffolded with all major pages and API routes. All data operations are stubbed with mock data until Supabase integration is completed. Once you set up your Supabase project, the service layer (`src/lib/db/service.ts`) will automatically connect to the database.

### Completed Features (Phase 1 & 2)
- ✅ Next.js project setup with TypeScript + Tailwind CSS
- ✅ Drizzle ORM schema for all data models
- ✅ Auth pages (sign in, sign up)
- ✅ Dashboard with outstanding jobs, recent completions, leaderboard
- ✅ Task and Job detail pages with status management
- ✅ Family creation and join flow
- ✅ Reports page with tab navigation and wallboard
- ✅ Swap Meet marketplace placeholder
- ✅ API routes for all endpoints (stubbed with fallbacks)

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
