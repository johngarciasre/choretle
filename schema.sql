-- Enable PostgreSQL extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Families ───────────────────────────────────────────────────────

CREATE TABLE families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  logo_url TEXT,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/New_York',
  week_start_day INTEGER NOT NULL DEFAULT 0,
  teams_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Routines ───────────────────────────────────────────────────────

CREATE TABLE routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  week_start_day INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Users ──────────────────────────────────────────────────────────

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'child' CHECK (role IN ('admin', 'child')),
  family_id UUID REFERENCES families(id) ON DELETE SET NULL,
  points_total INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Teams ──────────────────────────────────────────────────────────

CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Team Members (join table) ──────────────────────────────────────

CREATE TABLE team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT team_members_unique UNIQUE(team_id, user_id)
);

-- ─── Tasks ──────────────────────────────────────────────────────────

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  icon VARCHAR(50),
  archtype VARCHAR(50) NOT NULL DEFAULT 'job',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Subtasks ───────────────────────────────────────────────────────

CREATE TABLE subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  ord INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Slates ─────────────────────────────────────────────────────────

CREATE TABLE slates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  room_location VARCHAR(100),
  frequency VARCHAR(20) NOT NULL DEFAULT 'weekly',
  interval INTEGER NOT NULL DEFAULT 1,
  default_due_date_offset INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Slate Tasks (link slates to tasks) ─────────────────────────────

CREATE TABLE slate_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slate_id UUID NOT NULL REFERENCES slates(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  points_override INTEGER,
  ord INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT slate_task_unique UNIQUE(slate_id, task_id)
);

-- ─── Lists (generated from slates) ──────────────────────────────────

CREATE TABLE lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slate_id UUID NOT NULL REFERENCES slates(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  period VARCHAR(10) NOT NULL DEFAULT 'day',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── List Tasks (link lists to slate tasks) ─────────────────────────

CREATE TABLE list_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  slate_task_id UUID NOT NULL REFERENCES slate_tasks(id) ON DELETE CASCADE,
  points_override INTEGER,
  CONSTRAINT list_task_unique UNIQUE(list_id, slate_task_id)
);

-- ─── Jobs (assigned work items) ─────────────────────────────────────

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  slate_task_id UUID,
  list_task_id UUID,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Job Subtasks ───────────────────────────────────────────────────

CREATE TABLE job_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  subtask_id UUID NOT NULL REFERENCES subtasks(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ,
  points_awarded INTEGER NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  CONSTRAINT job_subtask_unique UNIQUE(job_id, subtask_id)
);

-- ─── Comments ───────────────────────────────────────────────────────

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Job History ────────────────────────────────────────────────────

CREATE TABLE job_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  details TEXT,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Reports ────────────────────────────────────────────────────────

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Rotations (user-slate assignment scheduling) ───────────────────

CREATE TABLE rotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slate_id UUID NOT NULL REFERENCES slates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL DEFAULT 0,
  interval_days INTEGER NOT NULL DEFAULT 7,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- ─── Swap Meet (slate sharing between families) ─────────────────────

CREATE TABLE swap_meet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slate_id UUID NOT NULL REFERENCES slates(id) ON DELETE CASCADE,
  sharing_family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Invites ────────────────────────────────────────────────────────

CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  code VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255),
  role VARCHAR(20) NOT NULL DEFAULT 'child' CHECK (role IN ('admin', 'child')),
  expires_at TIMESTAMPTZ,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invite_code_length CHECK (char_length(code) = 6 OR char_length(code) = 8)
);

-- ─── INDEXES ────────────────────────────────────────────────────────

CREATE INDEX idx_users_family_id ON users(family_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_tasks_family_id ON tasks(family_id);
CREATE INDEX idx_subtasks_task_id ON subtasks(task_id);
CREATE INDEX idx_slates_family_id ON slates(family_id);
CREATE INDEX idx_slate_tasks_slate_id ON slate_tasks(slate_id);
CREATE INDEX idx_lists_family_id ON lists(family_id);
CREATE INDEX idx_lists_list_id ON lists(list_id);
CREATE INDEX idx_jobs_list_id ON jobs(list_id);
CREATE INDEX idx_jobs_assigned_to ON jobs(assigned_to);
CREATE INDEX idx_comments_job_id ON comments(job_id);
CREATE INDEX idx_reports_family_id ON reports(family_id);
CREATE INDEX idx_rotations_slate_id ON rotations(slate_id);
CREATE INDEX idx_invites_code ON invites(code);
CREATE INDEX idx_invites_family_id ON invites(family_id);
