-- =============================================================================
-- Migration 041: Attendance analytics aggregate helpers (Phase 1B)
--
-- Read-only grouped-count helpers for the attendance dashboard / class summary
-- pages. PostgREST can't express GROUP BY, so these wrap the aggregation.
--
-- SECURITY INVOKER (the default — no SECURITY DEFINER): each function runs with
-- the CALLER's row-level security, so a school_admin only ever sees their own
-- school's rows. The explicit p_school_id argument keeps the scans selective and
-- means a tampered id simply returns nothing (RLS filters it). search_path is
-- pinned to avoid injection. Nothing is written.
--
-- "Assiduité" (attendance rate) is computed in the app as (total - absent) /
-- total, i.e. présents + retards + justifiés count as attended.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

-- ── Per-class totals for an academic year ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.attendance_class_summary(
  p_school_id uuid,
  p_year_id   uuid
)
RETURNS TABLE (
  class_id      uuid,
  class_name    text,
  class_section text,
  present       bigint,
  absent        bigint,
  late          bigint,
  excused       bigint,
  total         bigint,
  sessions      bigint
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    c.id,
    c.name,
    c.section,
    COUNT(ar.id) FILTER (WHERE ar.status = 'present'),
    COUNT(ar.id) FILTER (WHERE ar.status = 'absent'),
    COUNT(ar.id) FILTER (WHERE ar.status = 'late'),
    COUNT(ar.id) FILTER (WHERE ar.status = 'excused'),
    COUNT(ar.id),
    COUNT(DISTINCT s.id)
  FROM public.classes c
  LEFT JOIN public.attendance_sessions s
    ON s.class_id = c.id
   AND s.school_id = p_school_id
   AND s.academic_year_id = p_year_id
  LEFT JOIN public.attendance_records ar
    ON ar.session_id = s.id
  WHERE c.school_id = p_school_id
    AND c.academic_year_id = p_year_id
  GROUP BY c.id, c.name, c.section
  ORDER BY c.name;
$$;

-- ── Per-month totals for an academic year ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.attendance_monthly_summary(
  p_school_id uuid,
  p_year_id   uuid
)
RETURNS TABLE (
  month   text,
  present bigint,
  absent  bigint,
  late    bigint,
  excused bigint,
  total   bigint
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    to_char(s.session_date, 'YYYY-MM'),
    COUNT(ar.id) FILTER (WHERE ar.status = 'present'),
    COUNT(ar.id) FILTER (WHERE ar.status = 'absent'),
    COUNT(ar.id) FILTER (WHERE ar.status = 'late'),
    COUNT(ar.id) FILTER (WHERE ar.status = 'excused'),
    COUNT(ar.id)
  FROM public.attendance_sessions s
  JOIN public.attendance_records ar ON ar.session_id = s.id
  WHERE s.school_id = p_school_id
    AND s.academic_year_id = p_year_id
  GROUP BY to_char(s.session_date, 'YYYY-MM')
  ORDER BY to_char(s.session_date, 'YYYY-MM') DESC;
$$;

-- ── Per-day totals within a date range (recent daily summary) ─────────────────
CREATE OR REPLACE FUNCTION public.attendance_daily_summary(
  p_school_id uuid,
  p_year_id   uuid,
  p_from      date,
  p_to        date
)
RETURNS TABLE (
  day     date,
  present bigint,
  absent  bigint,
  late    bigint,
  excused bigint,
  total   bigint
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    s.session_date,
    COUNT(ar.id) FILTER (WHERE ar.status = 'present'),
    COUNT(ar.id) FILTER (WHERE ar.status = 'absent'),
    COUNT(ar.id) FILTER (WHERE ar.status = 'late'),
    COUNT(ar.id) FILTER (WHERE ar.status = 'excused'),
    COUNT(ar.id)
  FROM public.attendance_sessions s
  JOIN public.attendance_records ar ON ar.session_id = s.id
  WHERE s.school_id = p_school_id
    AND s.academic_year_id = p_year_id
    AND s.session_date BETWEEN p_from AND p_to
  GROUP BY s.session_date
  ORDER BY s.session_date DESC;
$$;

GRANT EXECUTE ON FUNCTION public.attendance_class_summary(uuid, uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_monthly_summary(uuid, uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_daily_summary(uuid, uuid, date, date) TO authenticated;
