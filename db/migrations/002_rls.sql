-- Row-level security: the household is the tenant, enforced by the database.
--
-- Every statement issued inside a tenant scope (see src/db/tenant.ts) runs in a
-- transaction that sets `app.household_id` and switches to `choretle_app`. That
-- role is not the table owner, so policies apply to it.
--
-- ENABLE, deliberately not FORCE: the owner keeps bypassing policies, which is
-- what lets migrations, the demo seed, sign-in and session lookup work before a
-- tenant is known. The app never issues tenant work as the owner.
--
-- A policy reads `current_setting('app.household_id', true)`, which is NULL when
-- unset, so a scoped statement with no household sees nothing.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'choretle_app') then
    create role choretle_app nologin nosuperuser nobypassrls;
  end if;
end
$$;

grant usage on schema public to choretle_app;
grant select, insert, update, delete on all tables in schema public to choretle_app;

-- ─── Tables that carry household_id directly ────────────────────────────────

alter table households       enable row level security;
alter table memberships      enable row level security;
alter table household_links  enable row level security;
alter table sessions         enable row level security;
alter table device_enrollments enable row level security;
alter table routines         enable row level security;
alter table teams            enable row level security;
alter table tasks            enable row level security;
alter table subtasks         enable row level security;
alter table slates           enable row level security;
alter table lists            enable row level security;
alter table reports          enable row level security;
alter table tags             enable row level security;
alter table photos           enable row level security;
alter table reviews          enable row level security;
alter table invites          enable row level security;
alter table swap_meet        enable row level security;

-- A household can see itself, and the household on the other side of one of its
-- links (needed to name the partner without a cross-tenant bypass).
drop policy if exists households_tenant on households;
create policy households_tenant on households
  for all
  using (
    id = current_setting('app.household_id', true)
    or exists (
      select 1 from household_links hl
       where hl.status = 'active'
         and (
           (hl.household_id = current_setting('app.household_id', true) and hl.linked_household_id = households.id)
           or (hl.linked_household_id = current_setting('app.household_id', true) and hl.household_id = households.id)
         )
    )
  )
  with check (id = current_setting('app.household_id', true));

drop policy if exists memberships_tenant on memberships;
create policy memberships_tenant on memberships
  for all
  using (household_id = current_setting('app.household_id', true))
  with check (household_id = current_setting('app.household_id', true));

-- Either side of a link may see the row; that is what makes approval and
-- revocation possible from the receiving household.
drop policy if exists household_links_tenant on household_links;
create policy household_links_tenant on household_links
  for all
  using (
    household_id = current_setting('app.household_id', true)
    or linked_household_id = current_setting('app.household_id', true)
  )
  with check (
    household_id = current_setting('app.household_id', true)
    or linked_household_id = current_setting('app.household_id', true)
  );

-- Sessions and enrollment codes belong to one household only.
drop policy if exists sessions_tenant on sessions;
create policy sessions_tenant on sessions
  for all
  using (household_id = current_setting('app.household_id', true))
  with check (household_id = current_setting('app.household_id', true));

drop policy if exists device_enrollments_tenant on device_enrollments;
create policy device_enrollments_tenant on device_enrollments
  for all
  using (household_id = current_setting('app.household_id', true))
  with check (household_id = current_setting('app.household_id', true));

-- Swap Meet is the deliberate cross-household read: a share is visible to the
-- household that offered it and the one that asked for it.
drop policy if exists swap_meet_tenant on swap_meet;
create policy swap_meet_tenant on swap_meet
  for all
  using (
    sharing_household_id = current_setting('app.household_id', true)
    or requesting_household_id = current_setting('app.household_id', true)
  )
  with check (sharing_household_id = current_setting('app.household_id', true));

-- The rest are the plain case.
do $$
declare
  t text;
begin
  foreach t in array array[
    'routines', 'teams', 'tasks', 'subtasks', 'slates', 'lists',
    'reports', 'tags', 'photos', 'reviews', 'invites'
  ]
  loop
    execute format('drop policy if exists %I_tenant on %I', t, t);
    execute format(
      'create policy %I_tenant on %I for all
         using (household_id = current_setting(''app.household_id'', true))
         with check (household_id = current_setting(''app.household_id'', true))',
      t, t
    );
  end loop;
end
$$;

-- ─── Child tables: isolation follows the parent ─────────────────────────────

alter table slate_tasks  enable row level security;
alter table list_tasks   enable row level security;
alter table jobs         enable row level security;
alter table job_subtasks enable row level security;
alter table comments     enable row level security;
alter table job_history  enable row level security;
alter table team_members enable row level security;
alter table task_tags    enable row level security;
alter table slate_tags   enable row level security;

drop policy if exists slate_tasks_tenant on slate_tasks;
create policy slate_tasks_tenant on slate_tasks
  for all
  using (exists (select 1 from slates s
                  where s.id = slate_tasks.slate_id
                    and s.household_id = current_setting('app.household_id', true)))
  with check (exists (select 1 from slates s
                       where s.id = slate_tasks.slate_id
                         and s.household_id = current_setting('app.household_id', true)));

drop policy if exists list_tasks_tenant on list_tasks;
create policy list_tasks_tenant on list_tasks
  for all
  using (exists (select 1 from lists l
                  where l.id = list_tasks.list_id
                    and l.household_id = current_setting('app.household_id', true)))
  with check (exists (select 1 from lists l
                       where l.id = list_tasks.list_id
                         and l.household_id = current_setting('app.household_id', true)));

drop policy if exists jobs_tenant on jobs;
create policy jobs_tenant on jobs
  for all
  using (exists (select 1 from lists l
                  where l.id = jobs.list_id
                    and l.household_id = current_setting('app.household_id', true)))
  with check (exists (select 1 from lists l
                       where l.id = jobs.list_id
                         and l.household_id = current_setting('app.household_id', true)));

do $$
declare
  t text;
begin
  foreach t in array array['job_subtasks', 'comments', 'job_history']
  loop
    execute format('drop policy if exists %I_tenant on %I', t, t);
    execute format(
      'create policy %I_tenant on %I for all
         using (exists (
           select 1 from jobs j join lists l on l.id = j.list_id
            where j.id = %I.job_id
              and l.household_id = current_setting(''app.household_id'', true)))
         with check (exists (
           select 1 from jobs j join lists l on l.id = j.list_id
            where j.id = %I.job_id
              and l.household_id = current_setting(''app.household_id'', true)))',
      t, t, t, t
    );
  end loop;
end
$$;

drop policy if exists team_members_tenant on team_members;
create policy team_members_tenant on team_members
  for all
  using (exists (select 1 from teams tm
                  where tm.id = team_members.team_id
                    and tm.household_id = current_setting('app.household_id', true)))
  with check (exists (select 1 from teams tm
                       where tm.id = team_members.team_id
                         and tm.household_id = current_setting('app.household_id', true)));

drop policy if exists task_tags_tenant on task_tags;
create policy task_tags_tenant on task_tags
  for all
  using (exists (select 1 from tasks tk
                  where tk.id = task_tags.task_id
                    and tk.household_id = current_setting('app.household_id', true)))
  with check (exists (select 1 from tasks tk
                       where tk.id = task_tags.task_id
                         and tk.household_id = current_setting('app.household_id', true)));

drop policy if exists slate_tags_tenant on slate_tags;
create policy slate_tags_tenant on slate_tags
  for all
  using (exists (select 1 from slates s
                  where s.id = slate_tags.slate_id
                    and s.household_id = current_setting('app.household_id', true)))
  with check (exists (select 1 from slates s
                       where s.id = slate_tags.slate_id
                         and s.household_id = current_setting('app.household_id', true)));

-- ─── Identity tables ────────────────────────────────────────────────────────
--
-- users has no household column: a person can belong to several households, and
-- sign-in has to find them before any tenant is known. Inside a tenant scope the
-- app may only read people who belong to that household; a new person may be
-- inserted first and linked to the household immediately afterwards.

alter table users           enable row level security;
alter table auth_identities enable row level security;

drop policy if exists users_read on users;
create policy users_read on users
  for select
  using (exists (select 1 from memberships m
                  where m.user_id = users.id
                    and m.household_id = current_setting('app.household_id', true)));

drop policy if exists users_insert on users;
create policy users_insert on users
  for insert with check (true);

drop policy if exists users_update on users;
create policy users_update on users
  for update
  using (exists (select 1 from memberships m
                  where m.user_id = users.id
                    and m.household_id = current_setting('app.household_id', true)))
  with check (exists (select 1 from memberships m
                       where m.user_id = users.id
                         and m.household_id = current_setting('app.household_id', true)));

drop policy if exists users_delete on users;
create policy users_delete on users
  for delete
  using (exists (select 1 from memberships m
                  where m.user_id = users.id
                    and m.household_id = current_setting('app.household_id', true)));

drop policy if exists auth_identities_read on auth_identities;
create policy auth_identities_read on auth_identities
  for select
  using (exists (select 1 from memberships m
                  where m.user_id = auth_identities.user_id
                    and m.household_id = current_setting('app.household_id', true)));

drop policy if exists auth_identities_write on auth_identities;
create policy auth_identities_write on auth_identities
  for insert with check (true);
