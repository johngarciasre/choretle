# Choretle User Guide

Choretle is a family chore management app that turns daily chores into an engaging game with points, streaks, leaderboards, and fair rotation scheduling.

## Quick Start — The Golden Path

This is the recommended setup flow for a brand-new family:

1. **Sign Up** — Visit `https://choretle.app/auth/signin` and create an account with your email.
2. **Create or Join a Family** — You will be taken to `/family` where you can either create a new family (enter a name) or join an existing one with a join code.
3. **Create Tasks** — Navigate to **Tasks** from the top nav bar. Click the **+** floating button to add chores your family does (e.e., "Clean the kitchen", "Take out the trash"). Assign points and tags to each task.
4. **Create Tags** — Go to **Family** → **Tags** section. Create descriptive tags like "Kitchen", "Cleaning", "Chores" to categorize tasks.
5. **Build Slates** — Navigate to **Slates**. Click the **+** button to create a slate (a chore template, e.g., "Kitchen Cleaning"). Then click **Configure Tasks & Tags** on the new slate to pick which specific tasks belong in it. You can also set auto-include rules based on tags.
6. **Set Up Rotations** — Go to **Rotations**. Drag and drop family members onto slate columns to assign who does which chore each day. The rotation board ensures fair distribution.
7. **Start Doing Chores** — As a child/member, go to **Jobs** to see your assigned chores. Click into a job and move it through the workflow: **Todo → Doing → Done**. Points are automatically awarded on completion.
8. **Check Progress** — Visit **Reports** for daily/done/task/member breakdowns of completed work and points. View **Swap Meet** to share slates with other families.

## Authentication & Navigation

- **Unauthenticated users** can only access `/` (landing page) and `/auth/signin`. All other routes redirect to the homepage.
- The top navigation bar is available after signing in with links to: Dashboard, Tasks, Jobs, Slates, Rotations, Reports, and Family.
- Sign out from the profile dropdown (initials avatar) in the top-right corner.

## Page-by-Page Guide

| Page | Description |
|------|-------------|
| [Home](pages/index.md) | Landing page with feature overview |
| [Sign In / Sign Up](pages/signin.md) | Authentication entry point |
| [Dashboard](pages/dashboard.md) | Entry point after signing in; links to main sections |
| [Tasks](pages/tasks.md) | Browse, create, edit, and organize chores |
| [Jobs](pages/jobs.md) | Active assigned chores with workflow controls |
| [Slates](pages/slates.md) | Chore templates grouping tasks for rotation |
| [Rotations](pages/rotations.md) | Drag-and-drop board assigning chores to members |
| [Reports](pages/reports.md) | Statistics and breakdowns of completed work |
| [Reviews](pages/reviews.md) | Queue for jobs requiring verification |
| [Swap Meet](pages/swap-meet.md) | Share slates with other families |
| [Family](pages/family.md) | Settings, members, teams, tags, and theme |
| [Profile](pages/profile.md) | Individual member stats, streaks, and achievements |
