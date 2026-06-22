-- =============================================================================
-- Migration 043: Transportation module (Phase 51)
--
-- School transport management: vehicles, drivers, routes, ordered stops, and
-- per-student route assignments with a monthly fee. Bundled for every school
-- (not a paid add-on in this phase).
--
-- Tenant model mirrors the rest of the app:
--   • every table is school-scoped (school_id) with RLS enabled
--   • school_admin gets full access; finance_officer gets read on the
--     fee-bearing tables (routes, assignments); parents read ONLY their own
--     child's transport via the SECURITY DEFINER RPC parent_child_transport()
--     (keeps driver phone / vehicle PII tightly scoped — no broad parent SELECT)
--   • cross-school row references are blocked by triggers (mirrors
--     check_parent_student_same_school from migration 002)
--   • RESTRICTIVE active-school write gate mirrors migrations 025/032/035
--   • one ACTIVE assignment per student is enforced by a partial unique index
--   • vehicle capacity is an APP-LEVEL warning only — no DB block (by design)
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
--       Do NOT apply automatically.
-- =============================================================================

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.transport_vehicles (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id              UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  registration_plate     TEXT NOT NULL,
  make                   TEXT,
  model                  TEXT,
  capacity               INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0),
  status                 TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'maintenance', 'inactive')),
  insurance_expiry_date  DATE,
  inspection_expiry_date DATE,
  notes                  TEXT,
  created_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT transport_vehicles_school_plate_unique UNIQUE (school_id, registration_plate)
);

CREATE TABLE IF NOT EXISTS public.transport_drivers (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id               UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  full_name               TEXT NOT NULL,
  phone                   TEXT,
  address                 TEXT,
  license_number          TEXT,
  license_expiry_date     DATE,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'inactive')),
  notes                   TEXT,
  created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS public.transport_routes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES public.schools(id)            ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  vehicle_id  UUID REFERENCES public.transport_vehicles(id)          ON DELETE SET NULL,
  driver_id   UUID REFERENCES public.transport_drivers(id)           ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive')),
  monthly_fee NUMERIC(12, 0) NOT NULL DEFAULT 0 CHECK (monthly_fee >= 0),
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS public.transport_stops (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES public.schools(id)         ON DELETE CASCADE,
  route_id     UUID NOT NULL REFERENCES public.transport_routes(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  pickup_time  TIME,
  dropoff_time TIME,
  stop_order   INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS public.student_transport_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES public.schools(id)          ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES public.students(id)         ON DELETE CASCADE,
  route_id    UUID NOT NULL REFERENCES public.transport_routes(id) ON DELETE CASCADE,
  stop_id     UUID REFERENCES public.transport_stops(id)           ON DELETE SET NULL,
  monthly_fee NUMERIC(12, 0) NOT NULL DEFAULT 0 CHECK (monthly_fee >= 0),
  start_date  DATE,
  end_date    DATE,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive')),
  notes       TEXT,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transport_vehicles_school_id ON public.transport_vehicles(school_id);
CREATE INDEX IF NOT EXISTS idx_transport_vehicles_status    ON public.transport_vehicles(school_id, status);
CREATE INDEX IF NOT EXISTS idx_transport_drivers_school_id  ON public.transport_drivers(school_id);
CREATE INDEX IF NOT EXISTS idx_transport_drivers_status     ON public.transport_drivers(school_id, status);
CREATE INDEX IF NOT EXISTS idx_transport_routes_school_id   ON public.transport_routes(school_id);
CREATE INDEX IF NOT EXISTS idx_transport_routes_vehicle_id  ON public.transport_routes(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_transport_routes_driver_id   ON public.transport_routes(driver_id);
CREATE INDEX IF NOT EXISTS idx_transport_stops_school_id    ON public.transport_stops(school_id);
CREATE INDEX IF NOT EXISTS idx_transport_stops_route_order  ON public.transport_stops(route_id, stop_order);
CREATE INDEX IF NOT EXISTS idx_sta_school_id                ON public.student_transport_assignments(school_id);
CREATE INDEX IF NOT EXISTS idx_sta_student_id               ON public.student_transport_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_sta_route_id                 ON public.student_transport_assignments(route_id);
CREATE INDEX IF NOT EXISTS idx_sta_stop_id                  ON public.student_transport_assignments(stop_id);
CREATE INDEX IF NOT EXISTS idx_sta_status                   ON public.student_transport_assignments(school_id, status);

-- One ACTIVE assignment per student (race-proof; app also checks).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_assignment_per_student
  ON public.student_transport_assignments(student_id)
  WHERE status = 'active';

-- ─── updated_at triggers (reuse shared helper from migration 002) ──────────────
DROP TRIGGER IF EXISTS trg_transport_vehicles_updated_at ON public.transport_vehicles;
CREATE TRIGGER trg_transport_vehicles_updated_at
  BEFORE UPDATE ON public.transport_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_transport_drivers_updated_at ON public.transport_drivers;
CREATE TRIGGER trg_transport_drivers_updated_at
  BEFORE UPDATE ON public.transport_drivers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_transport_routes_updated_at ON public.transport_routes;
CREATE TRIGGER trg_transport_routes_updated_at
  BEFORE UPDATE ON public.transport_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_transport_stops_updated_at ON public.transport_stops;
CREATE TRIGGER trg_transport_stops_updated_at
  BEFORE UPDATE ON public.transport_stops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_sta_updated_at ON public.student_transport_assignments;
CREATE TRIGGER trg_sta_updated_at
  BEFORE UPDATE ON public.student_transport_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── Cross-school integrity triggers ───────────────────────────────────────────
-- Mirrors check_parent_student_same_school (migration 002): a referenced row must
-- live in the same school as the referencing row. Prevents a tampered id from
-- stitching together two tenants. SECURITY DEFINER so the lookups bypass RLS.

CREATE OR REPLACE FUNCTION public.check_transport_route_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.vehicle_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.transport_vehicles v
    WHERE v.id = NEW.vehicle_id AND v.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Vehicle % is not in school %', NEW.vehicle_id, NEW.school_id;
  END IF;

  IF NEW.driver_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.transport_drivers d
    WHERE d.id = NEW.driver_id AND d.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Driver % is not in school %', NEW.driver_id, NEW.school_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transport_route_refs ON public.transport_routes;
CREATE TRIGGER trg_transport_route_refs
  BEFORE INSERT OR UPDATE ON public.transport_routes
  FOR EACH ROW EXECUTE FUNCTION public.check_transport_route_refs();

CREATE OR REPLACE FUNCTION public.check_transport_stop_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.transport_routes r
    WHERE r.id = NEW.route_id AND r.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Route % is not in school %', NEW.route_id, NEW.school_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transport_stop_refs ON public.transport_stops;
CREATE TRIGGER trg_transport_stop_refs
  BEFORE INSERT OR UPDATE ON public.transport_stops
  FOR EACH ROW EXECUTE FUNCTION public.check_transport_stop_refs();

CREATE OR REPLACE FUNCTION public.check_transport_assignment_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = NEW.student_id AND s.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Student % is not in school %', NEW.student_id, NEW.school_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.transport_routes r
    WHERE r.id = NEW.route_id AND r.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Route % is not in school %', NEW.route_id, NEW.school_id;
  END IF;

  -- Stop is optional, but when set it must belong to the same school AND the
  -- assigned route.
  IF NEW.stop_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.transport_stops st
    WHERE st.id = NEW.stop_id
      AND st.school_id = NEW.school_id
      AND st.route_id  = NEW.route_id
  ) THEN
    RAISE EXCEPTION 'Stop % is not on route % in school %', NEW.stop_id, NEW.route_id, NEW.school_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transport_assignment_refs ON public.student_transport_assignments;
CREATE TRIGGER trg_transport_assignment_refs
  BEFORE INSERT OR UPDATE ON public.student_transport_assignments
  FOR EACH ROW EXECUTE FUNCTION public.check_transport_assignment_refs();

-- ─── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.transport_vehicles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_drivers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_routes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_stops               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_transport_assignments ENABLE ROW LEVEL SECURITY;

-- School admin: full access on every transport table.
-- Super admin: platform oversight on every transport table.
DROP POLICY IF EXISTS "Admins manage transport vehicles" ON public.transport_vehicles;
CREATE POLICY "Admins manage transport vehicles" ON public.transport_vehicles
  FOR ALL USING (public.has_school_role(school_id, ARRAY['school_admin']));
DROP POLICY IF EXISTS "Super admin manage transport vehicles" ON public.transport_vehicles;
CREATE POLICY "Super admin manage transport vehicles" ON public.transport_vehicles
  FOR ALL USING (public.is_super_admin());

DROP POLICY IF EXISTS "Admins manage transport drivers" ON public.transport_drivers;
CREATE POLICY "Admins manage transport drivers" ON public.transport_drivers
  FOR ALL USING (public.has_school_role(school_id, ARRAY['school_admin']));
DROP POLICY IF EXISTS "Super admin manage transport drivers" ON public.transport_drivers;
CREATE POLICY "Super admin manage transport drivers" ON public.transport_drivers
  FOR ALL USING (public.is_super_admin());

DROP POLICY IF EXISTS "Admins manage transport routes" ON public.transport_routes;
CREATE POLICY "Admins manage transport routes" ON public.transport_routes
  FOR ALL USING (public.has_school_role(school_id, ARRAY['school_admin']));
DROP POLICY IF EXISTS "Super admin manage transport routes" ON public.transport_routes;
CREATE POLICY "Super admin manage transport routes" ON public.transport_routes
  FOR ALL USING (public.is_super_admin());
-- Finance officer: read routes (carry the monthly fee).
DROP POLICY IF EXISTS "Finance officers read transport routes" ON public.transport_routes;
CREATE POLICY "Finance officers read transport routes" ON public.transport_routes
  FOR SELECT USING (public.has_school_role(school_id, ARRAY['finance_officer']));

DROP POLICY IF EXISTS "Admins manage transport stops" ON public.transport_stops;
CREATE POLICY "Admins manage transport stops" ON public.transport_stops
  FOR ALL USING (public.has_school_role(school_id, ARRAY['school_admin']));
DROP POLICY IF EXISTS "Super admin manage transport stops" ON public.transport_stops;
CREATE POLICY "Super admin manage transport stops" ON public.transport_stops
  FOR ALL USING (public.is_super_admin());

DROP POLICY IF EXISTS "Admins manage transport assignments" ON public.student_transport_assignments;
CREATE POLICY "Admins manage transport assignments" ON public.student_transport_assignments
  FOR ALL USING (public.has_school_role(school_id, ARRAY['school_admin']));
DROP POLICY IF EXISTS "Super admin manage transport assignments" ON public.student_transport_assignments;
CREATE POLICY "Super admin manage transport assignments" ON public.student_transport_assignments
  FOR ALL USING (public.is_super_admin());
-- Finance officer: read assignments (fee visibility / expected revenue).
DROP POLICY IF EXISTS "Finance officers read transport assignments" ON public.student_transport_assignments;
CREATE POLICY "Finance officers read transport assignments" ON public.student_transport_assignments
  FOR SELECT USING (public.has_school_role(school_id, ARRAY['finance_officer']));
-- Parent: read ONLY their own child's assignment row (recursion-safe helper from
-- migration 038). Route/stop/driver/vehicle details are served via the
-- parent_child_transport() RPC below, not via direct table SELECT, so driver
-- phone and vehicle PII are never broadly exposed.
DROP POLICY IF EXISTS "Parents read own child transport assignment" ON public.student_transport_assignments;
CREATE POLICY "Parents read own child transport assignment" ON public.student_transport_assignments
  FOR SELECT USING (public.is_parent_of_student(student_id));

-- ─── RESTRICTIVE active-school write gate (consistent with migrations 025/035) ──
DO $$
DECLARE
  gate text := '(public.is_school_active(school_id) OR public.is_super_admin())';
  t    text;
  tables text[] := ARRAY[
    'transport_vehicles', 'transport_drivers', 'transport_routes',
    'transport_stops', 'student_transport_assignments'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS active_school_required_insert ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY active_school_required_insert ON public.%I AS RESTRICTIVE FOR INSERT WITH CHECK %s',
      t, gate);

    EXECUTE format('DROP POLICY IF EXISTS active_school_required_update ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY active_school_required_update ON public.%I AS RESTRICTIVE FOR UPDATE USING %s WITH CHECK %s',
      t, gate, gate);

    EXECUTE format('DROP POLICY IF EXISTS active_school_required_delete ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY active_school_required_delete ON public.%I AS RESTRICTIVE FOR DELETE USING %s',
      t, gate);
  END LOOP;
END $$;

-- ─── Parent read RPC ───────────────────────────────────────────────────────────
-- Returns the ACTIVE transport assignment (if any) for one of the caller's
-- children, with the route/stop/driver/vehicle details joined. SECURITY DEFINER
-- + an explicit is_parent_of_student() check is the access boundary: a parent
-- can only ever see a child they are linked to, and driver/vehicle PII is
-- exposed nowhere else.
CREATE OR REPLACE FUNCTION public.parent_child_transport(p_student_id uuid)
RETURNS TABLE (
  assignment_id      uuid,
  route_id           uuid,
  route_name         text,
  route_description  text,
  stop_name          text,
  pickup_time        time,
  dropoff_time       time,
  driver_name        text,
  driver_phone       text,
  vehicle_name       text,
  registration_plate text,
  monthly_fee        numeric,
  start_date         date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    a.id, r.id, r.name, r.description,
    st.name, st.pickup_time, st.dropoff_time,
    d.full_name, d.phone,
    v.name, v.registration_plate,
    a.monthly_fee, a.start_date
  FROM public.student_transport_assignments a
  JOIN public.transport_routes r   ON r.id = a.route_id
  LEFT JOIN public.transport_stops st ON st.id = a.stop_id
  LEFT JOIN public.transport_drivers d  ON d.id = r.driver_id
  LEFT JOIN public.transport_vehicles v ON v.id = r.vehicle_id
  WHERE a.student_id = p_student_id
    AND a.status = 'active'
    AND public.is_parent_of_student(p_student_id);
$$;

GRANT EXECUTE ON FUNCTION public.parent_child_transport(uuid) TO authenticated;
