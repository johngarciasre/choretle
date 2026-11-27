-- Choretle v2 initial schema (tabula rasa, 2026-11-26).
-- Postgres only. IDs are application-generated text so existing dev ids
-- (`dev-user-<uuid>`, `list-fixture-<uuid>`) keep working unchanged.
-- Legacy 0/1 flags stay `integer`; only columns introduced in v2 use boolean.

create table households (
  id             text primary key,
  name           text not null,
  slug           text unique not null,
  logo_url       text,
  timezone       text not null default 'America/New_York',
  week_start_day integer not null default 0,
  theme          text not null default 'coral',
  teams_enabled  boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Identity only: no tenancy column, no role, no points. Those live on memberships.
create table users (
  id           text primary key,
  email        text unique,
  name         text not null,
  avatar_url   text,
  birth_year   integer,
  pin_hash     text,
  pin_set_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table auth_identities (
  id           text primary key,
  user_id      text not null references users(id) on delete cascade,
  provider     text not null,
  provider_uid text not null,
  email        text,
  created_at   timestamptz not null default now(),
  unique (provider, provider_uid)
);

create table memberships (
  id           text primary key,
  household_id text not null references households(id) on delete cascade,
  user_id      text not null references users(id) on delete cascade,
  role         text not null check (role in ('parent','child','helper')),
  points_total integer not null default 0,
  joined_at    timestamptz not null default now(),
  unique (household_id, user_id)
);

create table household_links (
  id                  text primary key,
  household_id        text not null references households(id) on delete cascade,
  linked_household_id text not null references households(id) on delete cascade,
  requested_by        text not null references users(id),
  approved_by         text references users(id),
  status              text not null default 'pending'
                      check (status in ('pending','active','revoked')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (household_id <> linked_household_id),
  unique (household_id, linked_household_id)
);

create table sessions (
  id            text primary key,
  kind          text not null check (kind in ('adult','tablet_adult','kid','picker')),
  membership_id text references memberships(id) on delete cascade,
  household_id  text not null references households(id) on delete cascade,
  mode          text not null default 'own' check (mode in ('own','shared')),
  token_hash    text unique not null,
  device_label  text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);
create index idx_sessions_household on sessions(household_id);

create table device_enrollments (
  id           text primary key,
  household_id text not null references households(id) on delete cascade,
  user_id      text references users(id),
  code_hash    text unique not null,
  created_by   text not null references users(id),
  expires_at   timestamptz not null,
  used_at      timestamptz
);

-- ─── Legacy domain tables, tenant column renamed to household_id ───────────

create table routines (
  id text primary key, household_id text not null,
  week_start_day integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table teams (
  id text primary key, household_id text not null, name text not null,
  logo_url text, created_at timestamptz not null default now()
);

create table team_members (
  id text primary key, team_id text not null, user_id text not null,
  joined_at timestamptz not null default now()
);

create table tasks (
  id text primary key, household_id text not null, name text not null,
  description text, points integer not null default 0, icon text,
  archtype text not null default 'job', is_active integer not null default 1,
  verify_required integer not null default 0, schedule text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table subtasks (
  id text primary key, household_id text not null, task_id text,
  name text not null, points integer not null default 0,
  "order" integer not null default 0,
  created_at timestamptz not null default now()
);

create table slates (
  id text primary key, household_id text not null, name text not null,
  description text, room_location text,
  frequency text not null default 'weekly', interval integer not null default 1,
  schedule text, default_due_date_offset integer not null default 0,
  subtask_min_required integer, is_active integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table slate_tasks (
  id text primary key, slate_id text not null, task_id text not null,
  points_override integer, "order" integer not null default 0
);

create table lists (
  id text primary key, slate_id text not null, household_id text not null,
  name text not null, start_date timestamptz not null, end_date timestamptz,
  period text not null default 'day', status text not null default 'active',
  created_at timestamptz not null default now()
);

create table list_tasks (
  id text primary key, list_id text not null, slate_task_id text not null,
  points_override integer
);

create table jobs (
  id text primary key, list_id text not null, slate_task_id text,
  list_task_id text, assigned_to text, name text not null, description text,
  points integer not null default 0, status text not null default 'todo',
  verify_required integer not null default 0, reviewed_at timestamptz,
  due_date timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table job_subtasks (
  id text primary key, job_id text not null, subtask_id text not null,
  completed_at timestamptz, points_awarded integer not null default 0
);

create table comments (
  id text primary key, job_id text not null, user_id text not null,
  content text not null, created_at timestamptz not null default now()
);

create table job_history (
  id text primary key, job_id text not null, action text not null,
  details text, user_id text, created_at timestamptz not null default now()
);

create table reports (
  id text primary key, household_id text not null, type text not null,
  period_start timestamptz not null, period_end timestamptz, data text,
  created_at timestamptz not null default now()
);

create table rotations (
  id text primary key, slate_id text not null, user_id text not null,
  "order" integer not null default 0, interval_days integer not null default 7,
  is_active integer not null default 1
);

create table swap_meet (
  id text primary key, slate_id text not null,
  sharing_household_id text not null, requesting_household_id text,
  requested_by text, message text, status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table tags (
  id text primary key, household_id text not null, name text not null,
  color text, created_at timestamptz not null default now(),
  constraint tag_name_unique unique (household_id, name)
);

create table task_tags (
  id text primary key, tag_id text not null, task_id text not null
);

create table slate_tags (
  id text primary key, slate_id text not null, tag_id text not null
);

create table photos (
  id text primary key, household_id text not null, object_type text not null,
  object_id text not null, url text not null, title text,
  type text not null default 'probative', is_probative integer not null default 0,
  "order" integer not null default 0,
  created_at timestamptz not null default now()
);

create table reviews (
  id text primary key, job_id text not null, household_id text not null,
  reviewer_id text, approved_by text, status text not null default 'pending',
  notes text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table invites (
  id text primary key, household_id text not null, code text unique not null,
  email text, role text not null default 'child', expires_at timestamptz,
  used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tasks_household on tasks(household_id);
create index idx_tasks_archtype on tasks(archtype);
create index idx_jobs_list on jobs(list_id);
create index idx_jobs_status on jobs(status);
create index idx_rotations_slate on rotations(slate_id);
create index idx_tags_household on tags(household_id);
create index idx_memberships_household on memberships(household_id);
create index idx_memberships_user on memberships(user_id);
create index idx_slates_household on slates(household_id);

-- One list per slate per day. The UTC expression is immutable, so it can be
-- indexed (a plain timestamptz::date cast is not).
create unique index idx_lists_slate_start
  on lists (slate_id, ((start_date at time zone 'UTC')::date));
