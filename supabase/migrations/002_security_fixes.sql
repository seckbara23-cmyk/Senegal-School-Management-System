-- =============================================================================
-- Migration 002: Security Fixes
-- Addresses: recursive RLS, privilege escalation, search_path injection,
--            missing constraints, cross-school integrity, parent data leak,
--            inactive membership bypass, and updated_at automation.
-- =============================================================================

-- =============================================================================
-- PART 1: SECURITY DEFINER HELPER FUNCTIONS
-- These run as the function owner (postgres) and bypass RLS, which:
--   a) prevents recursive policy evaluation on self-referencing tables
--   b) prevents search_path injection (SET search_path = public, pg_temp)
-- =============================================================================

-- is_super_admin(): used in every policy that previously queried profiles
-- from within a profiles policy (causing infinite recursion).
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND global_role = 'super_admin'
  );
$$;

-- is_school_member(): used by policies that previously queried
-- school_memberships from within a school_memberships policy.
CREATE OR REPLACE FUNCTION public.is_school_member(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE user_id = auth.uid()
      AND school_id = p_school_id
      AND status = 'active'
  );
$$;

-- has_school_role(): checks that the caller holds a specific role in a school.
CREATE OR REPLACE FUNCTION public.has_school_role(p_school_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE user_id = auth.uid()
      AND school_id = p_school_id
      AND role = ANY(p_roles)
      AND status = 'active'
  );
$$;

-- =============================================================================
-- PART 2: FIX handle_new_user() — add safe search_path
-- The original had SECURITY DEFINER without SET search_path, which opens
-- a search_path injection vector.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email
  );
  RETURN NEW;
END;
$$;

-- =============================================================================
-- PART 3: PRIVILEGE ESCALATION FIX — profiles UPDATE policy
-- The original UPDATE policy had no WITH CHECK, meaning any user could set
-- their own global_role = 'super_admin' via the Supabase REST API.
-- =============================================================================

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Regular users can update their own profile but cannot change global_role.
-- WITH CHECK (global_role = 'user') ensures the new row still has role='user'.
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id AND NOT public.is_super_admin())
  WITH CHECK (auth.uid() = id AND global_role = 'user');

-- Super admins can update any profile (including promoting/demoting roles).
CREATE POLICY "Super admins can update any profile" ON public.profiles
  FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- =============================================================================
-- PART 4: FIX RECURSIVE PROFILE POLICIES
-- "Super admin can view all profiles" queried profiles FROM WITHIN a profiles
-- policy — causing recursion. Replace with the SECURITY DEFINER helper.
-- =============================================================================

DROP POLICY IF EXISTS "Super admin can view all profiles" ON public.profiles;

CREATE POLICY "Super admin can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_super_admin());

-- =============================================================================
-- PART 5: FIX SCHOOLS POLICIES
-- Replace recursive profiles lookups with is_super_admin() helper.
-- Also add active status check to membership lookup.
-- =============================================================================

DROP POLICY IF EXISTS "Users can view schools they belong to" ON public.schools;
DROP POLICY IF EXISTS "Super admin can manage all schools" ON public.schools;

CREATE POLICY "Users can view schools they belong to" ON public.schools
  FOR SELECT USING (
    public.is_school_member(schools.id) OR public.is_super_admin()
  );

CREATE POLICY "Super admin can manage all schools" ON public.schools
  FOR ALL USING (public.is_super_admin());

-- =============================================================================
-- PART 6: FIX SCHOOL_MEMBERSHIPS POLICIES
-- The original policies queried school_memberships FROM WITHIN school_memberships
-- policies — causing recursion. Replace with SECURITY DEFINER helpers.
-- =============================================================================

DROP POLICY IF EXISTS "School admins can view memberships in their school" ON public.school_memberships;
DROP POLICY IF EXISTS "School admins can manage memberships in their school" ON public.school_memberships;
DROP POLICY IF EXISTS "Super admin can view all memberships" ON public.school_memberships;
DROP POLICY IF EXISTS "Super admin can manage all memberships" ON public.school_memberships;

CREATE POLICY "School admins can view memberships in their school" ON public.school_memberships
  FOR SELECT USING (
    public.has_school_role(school_memberships.school_id, ARRAY['school_admin'])
  );

CREATE POLICY "School admins can manage memberships in their school" ON public.school_memberships
  FOR ALL USING (
    public.has_school_role(school_memberships.school_id, ARRAY['school_admin'])
  );

CREATE POLICY "Super admin can view all memberships" ON public.school_memberships
  FOR SELECT USING (public.is_super_admin());

CREATE POLICY "Super admin can manage all memberships" ON public.school_memberships
  FOR ALL USING (public.is_super_admin());

-- =============================================================================
-- PART 7: FIX STUDENTS POLICIES
-- Add active membership check; replace recursive profiles lookup.
-- =============================================================================

DROP POLICY IF EXISTS "Users can view students in their schools" ON public.students;
DROP POLICY IF EXISTS "School admins and teachers can manage students in their school" ON public.students;
DROP POLICY IF EXISTS "Super admin can manage all students" ON public.students;

CREATE POLICY "Users can view students in their schools" ON public.students
  FOR SELECT USING (
    public.is_school_member(students.school_id) OR public.is_super_admin()
  );

CREATE POLICY "School admins and teachers can manage students in their school" ON public.students
  FOR ALL USING (
    public.has_school_role(students.school_id, ARRAY['school_admin', 'teacher'])
  );

CREATE POLICY "Super admin can manage all students" ON public.students
  FOR ALL USING (public.is_super_admin());

-- =============================================================================
-- PART 8: FIX TEACHERS POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Users can view teachers in their schools" ON public.teachers;
DROP POLICY IF EXISTS "School admins can manage teachers in their school" ON public.teachers;
DROP POLICY IF EXISTS "Super admin can manage all teachers" ON public.teachers;

CREATE POLICY "Users can view teachers in their schools" ON public.teachers
  FOR SELECT USING (
    public.is_school_member(teachers.school_id) OR public.is_super_admin()
  );

CREATE POLICY "School admins can manage teachers in their school" ON public.teachers
  FOR ALL USING (
    public.has_school_role(teachers.school_id, ARRAY['school_admin'])
  );

CREATE POLICY "Super admin can manage all teachers" ON public.teachers
  FOR ALL USING (public.is_super_admin());

-- =============================================================================
-- PART 9: FIX PARENTS POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Users can view parents in their schools" ON public.parents;
DROP POLICY IF EXISTS "School admins can manage parents in their school" ON public.parents;
DROP POLICY IF EXISTS "Super admin can manage all parents" ON public.parents;

CREATE POLICY "Users can view parents in their schools" ON public.parents
  FOR SELECT USING (
    public.is_school_member(parents.school_id) OR public.is_super_admin()
  );

CREATE POLICY "School admins can manage parents in their school" ON public.parents
  FOR ALL USING (
    public.has_school_role(parents.school_id, ARRAY['school_admin'])
  );

CREATE POLICY "Super admin can manage all parents" ON public.parents
  FOR ALL USING (public.is_super_admin());

-- =============================================================================
-- PART 10: FIX PARENT_STUDENT_LINKS POLICIES (CRITICAL DATA LEAK)
-- The original "Users can view links in their schools" policy granted every
-- school member (including parents) access to ALL parent-student links in
-- the school, exposing every child's data to every parent.
--
-- New model:
--   - Parents see only their OWN links (unchanged)
--   - School STAFF (admin, teacher, finance_officer) see all links in their school
--   - Super admins see everything
--   - Other school members (students) see nothing
-- =============================================================================

DROP POLICY IF EXISTS "Parents can view their own links" ON public.parent_student_links;
DROP POLICY IF EXISTS "Users can view links in their schools" ON public.parent_student_links;
DROP POLICY IF EXISTS "School admins can manage links in their school" ON public.parent_student_links;
DROP POLICY IF EXISTS "Super admin can manage all links" ON public.parent_student_links;

-- Parents see only their own links (via parents.profile_id linkage)
CREATE POLICY "Parents can view their own links" ON public.parent_student_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parents p
      WHERE p.id = parent_student_links.parent_id
        AND p.profile_id = auth.uid()
    )
  );

-- School staff (not parents, not students) can see all links in their school
CREATE POLICY "School staff can view links in their school" ON public.parent_student_links
  FOR SELECT USING (
    public.has_school_role(
      parent_student_links.school_id,
      ARRAY['school_admin', 'teacher', 'finance_officer']
    )
  );

-- Only school admins can create/update/delete links
CREATE POLICY "School admins can manage links in their school" ON public.parent_student_links
  FOR ALL USING (
    public.has_school_role(parent_student_links.school_id, ARRAY['school_admin'])
  );

CREATE POLICY "Super admin can manage all links" ON public.parent_student_links
  FOR ALL USING (public.is_super_admin());

-- =============================================================================
-- PART 11: CROSS-SCHOOL INTEGRITY CONSTRAINT ON parent_student_links
-- Prevents linking a parent from School A to a student from School B,
-- which would silently corrupt multi-tenant data.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_parent_student_same_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent_school_id  uuid;
  v_student_school_id uuid;
BEGIN
  SELECT school_id INTO v_parent_school_id
    FROM public.parents WHERE id = NEW.parent_id;

  SELECT school_id INTO v_student_school_id
    FROM public.students WHERE id = NEW.student_id;

  IF v_parent_school_id IS NULL THEN
    RAISE EXCEPTION 'parent_id % does not exist', NEW.parent_id;
  END IF;

  IF v_student_school_id IS NULL THEN
    RAISE EXCEPTION 'student_id % does not exist', NEW.student_id;
  END IF;

  IF v_parent_school_id <> NEW.school_id OR v_student_school_id <> NEW.school_id THEN
    RAISE EXCEPTION
      'Cross-school link rejected: parent school=%, student school=%, link school=%',
      v_parent_school_id, v_student_school_id, NEW.school_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_parent_student_school ON public.parent_student_links;
CREATE TRIGGER trg_check_parent_student_school
  BEFORE INSERT OR UPDATE ON public.parent_student_links
  FOR EACH ROW EXECUTE FUNCTION public.check_parent_student_same_school();

-- =============================================================================
-- PART 12: MISSING UNIQUE CONSTRAINTS
-- Without these, duplicate admission/employee numbers can exist per school,
-- causing ambiguous lookups across grades, attendance, and payments.
-- =============================================================================

ALTER TABLE public.students
  ADD CONSTRAINT students_school_admission_unique
  UNIQUE (school_id, admission_number);

ALTER TABLE public.teachers
  ADD CONSTRAINT teachers_school_employee_unique
  UNIQUE (school_id, employee_number);

-- =============================================================================
-- PART 13: AUTO-UPDATE updated_at ON ALL TABLES
-- Without this, updated_at is permanently frozen at creation time.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_schools_updated_at ON public.schools;
CREATE TRIGGER trg_schools_updated_at
  BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_school_memberships_updated_at ON public.school_memberships;
CREATE TRIGGER trg_school_memberships_updated_at
  BEFORE UPDATE ON public.school_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_students_updated_at ON public.students;
CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_teachers_updated_at ON public.teachers;
CREATE TRIGGER trg_teachers_updated_at
  BEFORE UPDATE ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_parents_updated_at ON public.parents;
CREATE TRIGGER trg_parents_updated_at
  BEFORE UPDATE ON public.parents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_parent_student_links_updated_at ON public.parent_student_links;
CREATE TRIGGER trg_parent_student_links_updated_at
  BEFORE UPDATE ON public.parent_student_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
