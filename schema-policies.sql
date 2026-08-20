-- ═══════════════════════════════════════════════════════════
-- ROW-LEVEL SECURITY POLICIES (RLS)
-- Run these AFTER running schema.sql to enable row-level access control.
-- Every policy enforces that users can only access data belonging to their family.
-- ═══════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE slates ENABLE ROW LEVEL SECURITY;
ALTER TABLE slate_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE rotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE swap_meet ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- HELPER FUNCTION: get the current user's family id from JWT claims
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_current_family_id()
RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_family_id', true), '');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ═══════════════════════════════════════════════════════════
-- FAMILIES POLICIES
-- ═══════════════════════════════════════════════════════════

CREATE POLICY families_select_all ON families
  FOR SELECT USING (id = get_current_family_id()::uuid);

-- ═══════════════════════════════════════════════════════════
-- USERS POLICIES
-- ═══════════════════════════════════════════════════════════

CREATE POLICY users_select_on_family ON users
  FOR SELECT USING (family_id = get_current_family_id()::uuid);

CREATE POLICY users_update_self_or_admin ON users
  FOR UPDATE USING (
    id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users u2
      WHERE u2.id = auth.uid() AND u2.role = 'admin' AND u2.family_id = get_current_family_id()::uuid
    )
  );

CREATE POLICY users_insert_admin_only ON users
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u3
      WHERE u3.id = auth.uid() AND u3.role = 'admin' AND u3.family_id = get_current_family_id()::uuid
    )
  );

-- ═══════════════════════════════════════════════════════════
-- TEAMS & TEAM MEMBERS POLICIES
-- ═══════════════════════════════════════════════════════════

CREATE POLICY teams_select_all ON teams
  FOR SELECT USING (family_id = get_current_family_id()::uuid);

CREATE POLICY teams_insert_admin_only ON teams
  FOR INSERT WITH CHECK (
    family_id = get_current_family_id()::uuid AND
    EXISTS (
      SELECT 1 FROM users u4 WHERE u4.id = auth.uid() AND u4.role = 'admin' AND u4.family_id = get_current_family_id()::uuid
    )
  );

CREATE POLICY team_members_select_all ON team_members
  FOR SELECT USING (team_id IN (SELECT id FROM teams WHERE family_id = get_current_family_id()::uuid));

-- ═══════════════════════════════════════════════════════════
-- TASKS & SUBTASKS POLICIES
-- ═══════════════════════════════════════════════════════════

CREATE POLICY tasks_select_all ON tasks
  FOR SELECT USING (family_id = get_current_family_id()::uuid);

CREATE POLICY tasks_insert_admin_only ON tasks
  FOR INSERT WITH CHECK (
    family_id = get_current_family_id()::uuid AND
    EXISTS (
      SELECT 1 FROM users u5 WHERE u5.id = auth.uid() AND u5.role = 'admin' AND u5.family_id = get_current_family_id()::uuid
    )
  );

CREATE POLICY tasks_update_admin_only ON tasks
  FOR UPDATE USING (
    family_id = get_current_family_id()::uuid AND
    EXISTS (
      SELECT 1 FROM users u6 WHERE u6.id = auth.uid() AND u6.role = 'admin' AND u6.family_id = get_current_family_id()::uuid
    )
  );

CREATE POLICY tasks_delete_admin_only ON tasks
  FOR DELETE USING (
    family_id = get_current_family_id()::uuid AND
    EXISTS (
      SELECT 1 FROM users u7 WHERE u7.id = auth.uid() AND u7.role = 'admin' AND u7.family_id = get_current_family_id()::uuid
    )
  );

CREATE POLICY subtasks_select_all ON subtasks
  FOR SELECT USING (task_id IN (SELECT id FROM tasks WHERE family_id = get_current_family_id()::uuid));

-- ═══════════════════════════════════════════════════════════
-- SLATES & SLATE TASKS POLICIES
-- ═══════════════════════════════════════════════════════════

CREATE POLICY slates_select_all ON slates
  FOR SELECT USING (family_id = get_current_family_id()::uuid);

CREATE POLICY slate_tasks_select_all ON slate_tasks
  FOR SELECT USING (slate_id IN (SELECT id FROM slates WHERE family_id = get_current_family_id()::uuid));

-- ═══════════════════════════════════════════════════════════
-- LISTS & LIST TASKS POLICIES
-- ═══════════════════════════════════════════════════════════

CREATE POLICY lists_select_all ON lists
  FOR SELECT USING (family_id = get_current_family_id()::uuid);

CREATE POLICY list_tasks_select_all ON list_tasks
  FOR SELECT USING (list_id IN (SELECT id FROM lists WHERE family_id = get_current_family_id()::uuid));

-- ═══════════════════════════════════════════════════════════
-- JOBS & JOB SUBTASKS POLICIES
-- ═══════════════════════════════════════════════════════════

CREATE POLICY jobs_select_all ON jobs
  FOR SELECT USING (list_id IN (SELECT id FROM lists WHERE family_id = get_current_family_id()::uuid));

CREATE POLICY jobs_insert_on_list ON jobs
  FOR INSERT WITH CHECK (
    list_id IN (SELECT id FROM lists WHERE family_id = get_current_family_id()::uuid)
  );

CREATE POLICY jobs_update_assigned_or_admin ON jobs
  FOR UPDATE USING (
    list_id IN (
      SELECT id FROM lists WHERE family_id = get_current_family_id()::uuid
    ) AND (
      assigned_to = auth.uid() OR
      EXISTS (
        SELECT 1 FROM users u8 WHERE u8.id = auth.uid() AND u8.role = 'admin' AND u8.family_id = get_current_family_id()::uuid
      )
    )
  );

CREATE POLICY jobs_delete_admin_only ON jobs
  FOR DELETE USING (
    list_id IN (SELECT id FROM lists WHERE family_id = get_current_family_id()::uuid) AND
    EXISTS (
      SELECT 1 FROM users u9 WHERE u9.id = auth.uid() AND u9.role = 'admin' AND u9.family_id = get_current_family_id()::uuid
    )
  );

CREATE POLICY job_subtasks_select_all ON job_subtasks
  FOR SELECT USING (job_id IN (SELECT id FROM jobs WHERE list_id IN (SELECT id FROM lists WHERE family_id = get_current_family_id()::uuid)));

-- ═══════════════════════════════════════════════════════════
-- COMMENTS & HISTORY POLICIES
-- ═══════════════════════════════════════════════════════════

CREATE POLICY comments_select_all ON comments
  FOR SELECT USING (job_id IN (SELECT id FROM jobs WHERE list_id IN (SELECT id FROM lists WHERE family_id = get_current_family_id()::uuid)));

CREATE POLICY comments_insert_own ON comments
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY job_history_select_all ON job_history
  FOR SELECT USING (job_id IN (SELECT id FROM jobs WHERE list_id IN (SELECT id FROM lists WHERE family_id = get_current_family_id()::uuid)));

-- ═══════════════════════════════════════════════════════════
-- REPORTS POLICIES
-- ═══════════════════════════════════════════════════════════

CREATE POLICY reports_select_all ON reports
  FOR SELECT USING (family_id = get_current_family_id()::uuid);

-- ═══════════════════════════════════════════════════════════
-- ROTATIONS POLICIES
-- ═══════════════════════════════════════════════════════════

CREATE POLICY rotations_select_all ON rotations
  FOR SELECT USING (slate_id IN (SELECT id FROM slates WHERE family_id = get_current_family_id()::uuid));

-- ═══════════════════════════════════════════════════════════
-- SWAP MEET POLICIES
-- ═══════════════════════════════════════════════════════════

CREATE POLICY swap_meet_select_all ON swap_meet
  FOR SELECT USING (sharing_family_id = get_current_family_id()::uuid OR slate_id IN (SELECT id FROM slates WHERE family_id = get_current_family_id()::uuid));

-- ═══════════════════════════════════════════════════════════
-- INVITES POLICIES
-- ═══════════════════════════════════════════════════════════

CREATE POLICY invites_select_all ON invites
  FOR SELECT USING (family_id = get_current_family_id()::uuid);

CREATE POLICY invites_insert_admin_only ON invites
  FOR INSERT WITH CHECK (
    family_id = get_current_family_id()::uuid AND
    EXISTS (
      SELECT 1 FROM users u10 WHERE u10.id = auth.uid() AND u10.role = 'admin' AND u10.family_id = get_current_family_id()::uuid
    )
  );
