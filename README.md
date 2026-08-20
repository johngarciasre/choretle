# Choretle

A chore and habit tracking app for families — set tasks, assign to kids, track completion, earn points.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Database:** Supabase (PostgreSQL)
- **ORM:** Drizzle ORM
- **Styling:** Tailwind CSS
- **Auth:** Supabase Auth
- **Deployment:** Vercel

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file with your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   DATABASE_URL=file:.drizzle/db.sqlite
   ```

3. Set up your Supabase project and run the migrations (see `src/db/schema.ts`).

4. Start the dev server:
   ```bash
   npm run dev
   ```

## Project Structure

```
├── src/
│   ├── app/          # Next.js App Router pages
│   ├── db/           # Drizzle schema & migrations
│   ├── lib/          # Utilities (cn, helpers)
│   └── supabase/     # Supabase client setup
├── public/           # Static assets
├── PROJECT_PLAN.md   # Full project spec
└── ...
```

## Data Model Overview

- **Families** → Families/Orgs that contain users, teams, tasks
- **Users** → Parents (admin) and children (normal role)
- **Teams** → Sub-groups within a family that can compete
- **Tasks/Subtasks** → Units of work with point values
- **Slates** → Templates for recurring task sets
- **Lists** → Generated from Slates for a specific period (day/week)
- **Jobs** → Assigned work items with Todo→Doing→Done workflow
- **Reports** → Daily, done, and member scoring reports
- **Rotations** → User-to-slate assignment scheduling
- **Swap Meet** → Marketplace for sharing slates between families

## License

Open source.
