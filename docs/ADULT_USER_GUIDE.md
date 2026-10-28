# Choretle — Adult (Parent) User Guide

## Getting Started

### 1. Create an Account
- Go to **Choretle** and click **Sign Up**.
- Enter your name, email, and password.
- After signing up, you'll be prompted to create or join a family.

### 2. Family Setup
- **Create a Family**: Give it a name (e.e., "Our Family"). A unique invite code is generated.
- **Join a Family**: Enter the 6–8 character code shared by your family leader.
- Once inside, you'll be taken to your dashboard.

---

## Managing Your Family

### Invite Members
- Go to **Family Settings** (via the profile dropdown → Family Settings).
- Each member gets an invite code you can share with children or other parents.
- Children sign up with role `child`; adults use `parent`.

### Create Teams (Optional)
- In Family Settings, create teams like "Kitchen Crew" or "Weekend Chores".
- Assign members to teams for organized chore distribution.

---

## Tasks — The Building Blocks

Tasks are reusable chore templates. A task defines **what** needs to be done and how many points it's worth.

### Creating a Task
1. Go to **Tasks** → click **Create Task**.
2. Fill in:
   - **Name**: e.e., "Clean the kitchen"
   - **Description**: Optional details ("Wipe all dishes, sweep floor")
   - **Points**: Reward value (e.e., 10 pts)
3. Click **Save**.

### Managing Tasks
- Browse all tasks on the **Tasks** page; filter by tags.
- Click any task to view/edit its details.
- Delete tasks you no longer need.

---

## Tags — Organize Your Tasks

Tags let you group tasks for filtering and automatic slate inclusion.

1. Go to **Family Settings** → Tags (or create via the tag UI).
2. Assign a name and color to each tag (e.e., "Kitchen" = red, "Cleaning" = blue).
3. When creating/editing a task, assign one or more tags.

---

## Slates — Scheduled Task Templates

Slates are the heart of Choretle's automation. A slate defines **when** and **which** tasks appear in a child's chore list.

### Creating a Slate
1. Go to **Slates** → click the **+** button (or "New Slate" FAB).
2. Enter a name (e.e., "Kitchen Cleaning").
3. Set the **Schedule**:
   - **Weekly** — runs every week on selected days
   - **Monthly (Day)** — runs on a specific day of each month (e.e., 1st = every month)
   - **Monthly (Week Pattern)** — runs on a specific week-day combo (e.e., 2nd Tuesday)
4. Set the **Interval**: how many days between list generations (e.e., 7 for weekly).
5. Click **Create Slate**.

### Configuring a Slate's Tasks
After creating a slate, click **Configure Tasks & Tags** to define what chores it generates:

1. **Explicit Tasks** — These tasks are always included in every generated list. Click `+` on any task card to add it.
2. **Auto-Include by Tag** — Select tags; all tasks with those tags will be automatically added to the slate.
3. The **Effective Tasks Preview** shows the final union of explicit + tag-matched tasks.
4. Click **Save Slate Configuration**.

> **Tip**: Use a mix of explicit tasks (chores that must always happen) and auto-included tags (flexible tasks from a category).

---

## Dashboard — Your Family Overview

The dashboard shows two views depending on your role:

### Parent View
- **Active Task Lists** — Current lists generated from slates with progress bars. Each card shows todo/doing/done counts and a completion percentage.
- **Recent Completions** — Latest chores completed by any family member.
- **Quick Actions** — "New Task" and "New Slate" buttons for fast creation.

### Kid View
- **Stats Row** — Total points, day streak, weekly done count, pending tasks.
- **Your Tasks** — Outstanding jobs assigned to this child with due dates and status badges.
- **Needs Verification** — Tasks the child marked as done but awaiting parent approval.
- **Recent Wins** — Cards showing recently completed chores.
- **Streak Progress** — Visual progress bar toward streak milestones.

---

## Rotations — Assigning Chores to Members

Rotations determine **who** does **which** slate on **which** day.

> ⚧ Rotations UI is marked as "under development." The API supports rotation creation and management, but the visual board is not yet implemented.

### How Rotations Work
1. Each slate can have a rotation schedule that cycles family members through assignments.
2. When a list is generated, jobs are created from the slate's tasks and assigned to the currently active rotation member.
3. The rotation order is configurable per slate.

---

## Reports — Monitoring Family Activity

Go to **Reports** to view five types of data:

| Tab | What It Shows |
|-----|--------------|
| **Daily** | All jobs active on a specific date (filters by list date range). Use the date picker to look at any day. |
| **Done** | Completed jobs in the last N days. |
| **Task** | Per-task completion counts — how many times each task template has been completed total vs done. |
| **Completion Rate** | Per-task percentage rates with a table showing completed/total/rate. Also lists all completed jobs in the date range. Use the date pickers to set your window (defaults to 7 days). |
| **Member** | Per-member stats — total points, total jobs, and done jobs for each family member. |

### Wallboard
- Click the **Wallboard** button on any report tab to toggle a leaderboard view.
- Shows all family members ranked by total points.

> **Note**: The "Done" and "Completion Rate" reports filter by list creation date (`lists.start_date`), not by `jobs.completed_at`. This means they show tasks from lists *created* in the window, not necessarily tasks *completed* in that window. For accurate completion-date filtering, use the Task report or check individual job histories.

---

## Swap Meet — Sharing Slates Between Families

Swap Meet lets you share your chore templates with other families.

### Viewing Your Rotation Schedule
- Go to **Swap Meet** to see upcoming assignments across all your slates.
- Switch between 7/14/30/60-day lookaheads.

### Swapping Assignments
- Select a slate, then pick two rotation entries to swap. This exchanges which member is assigned on which dates.

### Sharing Slates
1. Click **Share Slate(s)**.
2. Enter the other family's ID.
3. Select which slates to share.
4. The receiving family gets `swap_meet` entries they can accept.

---

## Quick Reference: Workflow

```
Create Tasks → Create Tags → Create Slates (assign tasks + tags) → Generate Lists
                                                    ↓
                                        Monitor Dashboard / Reports
                                                    ↓
                                  Kids complete chores via Kanban board
                                                    ↓
                                Parents review completion reports
```
