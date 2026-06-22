-- ============================================================================
-- ScolaTech — Pilot demo dataset (REVIEW BEFORE RUNNING)
-- ----------------------------------------------------------------------------
-- Builds one realistic, self-contained demo school ("Collège Démo ScolaTech")
-- with an active year, classes, subjects, teachers, students, parents,
-- timetable, attendance, grades (report cards render from these), invoices &
-- payments, and a transport network (vehicles/drivers/routes/stops/assignments).
--
-- SAFETY MODEL — why this is safe to run on a shared database:
--   • Every row is scoped to a single SENTINEL school identified by the unique
--     slug 'scolatech-pilot-demo'. The script first DELETEs that one school;
--     all child rows disappear via ON DELETE CASCADE. It then rebuilds from
--     scratch. It therefore ONLY ever touches the demo school — it cannot read,
--     modify, or delete any production school's data.
--   • It is IDEMPOTENT: re-running drops and recreates the same demo school.
--   • It does NOT create auth users and does NOT change anyone's global_role.
--   • It is NOT applied automatically — run it yourself in the Supabase SQL
--     editor (or psql) only after reviewing it.
--
-- HOW TO PREVIEW WITHOUT KEEPING IT:
--     BEGIN;
--       \i seed_pilot_demo.sql      -- or paste the body
--       -- inspect the verification counts printed at the end
--     ROLLBACK;                      -- discard, leaving the DB untouched
--   Replace ROLLBACK with COMMIT to keep the demo data.
--
-- PREREQUISITE: migrations 001–043 must already be applied (transport needs 043).
-- Run in the SQL editor as the postgres/service role (bypasses RLS).
-- ============================================================================

-- The optional Part 2 at the bottom links a login account to the demo school.

DO $$
DECLARE
  v_demo_slug   text := 'scolatech-pilot-demo';
  v_school_id   uuid;
  v_year_id     uuid;
  v_year_name   text := '2025-2026';
  v_year_start  date := DATE '2025-10-01';
  v_period_id   uuid;                       -- the active period (Trimestre 3)
  v_assess1     date := DATE '2026-05-15';
  v_assess2     date := DATE '2026-06-10';

  -- name pools (Senegalese)
  v_last      text[] := ARRAY['Diop','Ndiaye','Fall','Gueye','Sow','Ba','Sarr','Diallo','Faye','Mbaye','Sy','Kane','Niang','Cissé','Sène','Touré','Camara','Ndour','Diouf','Thiam'];
  v_fm        text[] := ARRAY['Mamadou','Ousmane','Cheikh','Modou','Ibrahima','Abdoulaye','Moussa','Pape','Babacar','Aliou','Souleymane','Lamine'];
  v_ff        text[] := ARRAY['Awa','Fatou','Aïssatou','Mariama','Khadija','Astou','Ndeye','Sokhna','Bineta','Rama','Coumba','Adji'];

  v_class_names  text[] := ARRAY['6ème A','5ème A','4ème A','3ème A'];
  v_class_levels text[] := ARRAY['6ème','5ème','4ème','3ème'];
  v_class_ids    uuid[] := ARRAY[]::uuid[];

  -- subjects: name, code, coefficient
  v_subj_names text[] := ARRAY['Mathématiques','Français','Anglais','SVT','Physique-Chimie','Histoire-Géographie','EPS','Éducation civique'];
  v_subj_codes text[] := ARRAY['MATH','FR','ANG','SVT','PC','HG','EPS','EC'];
  v_subj_coef  numeric[] := ARRAY[4,4,2,2,2,2,1,1];

  v_n_classes   int := 4;
  v_per_class   int := 12;
  v_n_teachers  int := 10;

  v_i int; v_j int; v_seq int := 0;
  v_cid uuid; v_sid uuid; v_pid uuid;
  v_gender text; v_first text; v_plast text; v_pfirst text; v_rel text;
  v_admno text;

  v_session_id uuid; v_made int; v_d int; v_date date; v_dow int;

  rec record;
  v_a1 uuid; v_a2 uuid;

  v_fee_scol uuid; v_fee_insc uuid;
  v_inv_id uuid; v_inv_seq int := 0; v_rec_seq int := 0;
  v_total numeric := 150000; v_roll numeric;

  v_veh1 uuid; v_veh2 uuid; v_veh3 uuid;
  v_drv1 uuid; v_drv2 uuid; v_drv3 uuid;
  v_rt1 uuid; v_rt2 uuid; v_stop1 uuid; v_stop2 uuid;
  v_yr text := to_char(CURRENT_DATE, 'YYYY');
BEGIN
  PERFORM setseed(0.4242);  -- reproducible pseudo-random distributions

  -- ── Guard + reset (only ever the sentinel demo school) ────────────────────
  DELETE FROM public.schools WHERE slug = v_demo_slug;
  RAISE NOTICE 'Reset any previous demo school (slug=%).', v_demo_slug;

  -- ── School + active year + periods ────────────────────────────────────────
  INSERT INTO public.schools (name, slug, phone, email, address, subscription_status)
  VALUES ('Collège Démo ScolaTech', v_demo_slug, '+221 33 800 00 00', 'contact@demo.scolatech.app', 'Dakar, Sénégal', 'active')
  RETURNING id INTO v_school_id;

  INSERT INTO public.academic_years (school_id, name, starts_on, ends_on, is_active)
  VALUES (v_school_id, v_year_name, v_year_start, DATE '2026-07-31', true)
  RETURNING id INTO v_year_id;

  INSERT INTO public.academic_periods (school_id, academic_year_id, name, starts_on, ends_on, is_active) VALUES
    (v_school_id, v_year_id, 'Trimestre 1', DATE '2025-10-01', DATE '2025-12-20', false),
    (v_school_id, v_year_id, 'Trimestre 2', DATE '2026-01-06', DATE '2026-03-28', false);
  INSERT INTO public.academic_periods (school_id, academic_year_id, name, starts_on, ends_on, is_active)
  VALUES (v_school_id, v_year_id, 'Trimestre 3', DATE '2026-04-06', DATE '2026-07-31', true)
  RETURNING id INTO v_period_id;

  -- ── Subjects ──────────────────────────────────────────────────────────────
  FOR v_i IN 1 .. array_length(v_subj_names, 1) LOOP
    INSERT INTO public.subjects (school_id, name, code, coefficient)
    VALUES (v_school_id, v_subj_names[v_i], v_subj_codes[v_i], v_subj_coef[v_i]);
  END LOOP;

  -- ── Classes ───────────────────────────────────────────────────────────────
  FOR v_i IN 1 .. v_n_classes LOOP
    INSERT INTO public.classes (school_id, academic_year_id, name, level, section)
    VALUES (v_school_id, v_year_id, v_class_names[v_i], v_class_levels[v_i], 'A')
    RETURNING id INTO v_cid;
    v_class_ids := array_append(v_class_ids, v_cid);
  END LOOP;

  -- ── class_subjects: every subject in every class ──────────────────────────
  INSERT INTO public.class_subjects (school_id, class_id, subject_id, academic_year_id)
  SELECT v_school_id, c.id, s.id, v_year_id
  FROM public.classes c CROSS JOIN public.subjects s
  WHERE c.school_id = v_school_id AND s.school_id = v_school_id;

  -- ── Teachers ──────────────────────────────────────────────────────────────
  FOR v_i IN 1 .. v_n_teachers LOOP
    v_gender := CASE WHEN v_i % 2 = 0 THEN 'f' ELSE 'm' END;
    v_first  := CASE WHEN v_gender = 'm' THEN v_fm[1 + (v_i % array_length(v_fm,1))] ELSE v_ff[1 + (v_i % array_length(v_ff,1))] END;
    v_plast  := v_last[1 + ((v_i * 3) % array_length(v_last,1))];
    INSERT INTO public.teachers (school_id, employee_number, first_name, last_name, phone, email, status)
    VALUES (v_school_id, 'EMP-' || lpad(v_i::text, 3, '0'), v_first, v_plast,
            '+221 77 ' || lpad((100 + v_i)::text, 3, '0') || ' 00 00',
            lower(v_first) || '.' || lower(v_plast) || '@demo.scolatech.app', 'active');
  END LOOP;

  -- one teacher per class_subject (round-robin) — satisfies UNIQUE(class_subject_id)
  INSERT INTO public.teacher_subject_assignments (school_id, teacher_id, class_subject_id)
  WITH t AS (
    SELECT id, row_number() OVER (ORDER BY employee_number) AS rn
    FROM public.teachers WHERE school_id = v_school_id
  ), cs AS (
    SELECT id, row_number() OVER (ORDER BY class_id, subject_id) AS rn
    FROM public.class_subjects WHERE school_id = v_school_id
  )
  SELECT v_school_id, t.id, cs.id
  FROM cs JOIN t ON t.rn = ((cs.rn - 1) % (SELECT count(*) FROM t)) + 1;

  -- ── Students + parents + enrollments + parent links ───────────────────────
  FOR v_i IN 1 .. v_n_classes LOOP
    v_cid := v_class_ids[v_i];
    FOR v_j IN 1 .. v_per_class LOOP
      v_seq   := v_seq + 1;
      v_gender := CASE WHEN v_seq % 2 = 0 THEN 'female' ELSE 'male' END;
      v_first  := CASE WHEN v_gender = 'male' THEN v_fm[1 + (v_seq % array_length(v_fm,1))] ELSE v_ff[1 + (v_seq % array_length(v_ff,1))] END;
      v_plast  := v_last[1 + (v_seq % array_length(v_last,1))];
      v_admno  := 'STU-' || v_year_name || '-' || lpad(v_seq::text, 4, '0');

      INSERT INTO public.students (school_id, admission_number, first_name, last_name, gender, date_of_birth, status)
      VALUES (v_school_id, v_admno, v_first, v_plast, v_gender,
              DATE '2012-01-01' + ((v_seq * 37) % 1400), 'active')
      RETURNING id INTO v_sid;

      INSERT INTO public.student_class_enrollments (school_id, student_id, class_id, academic_year_id, status)
      VALUES (v_school_id, v_sid, v_cid, v_year_id, 'active');

      -- one guardian per student
      v_rel    := CASE WHEN v_seq % 2 = 0 THEN 'mother' ELSE 'father' END;
      v_pfirst := CASE WHEN v_rel = 'father' THEN v_fm[1 + ((v_seq * 5) % array_length(v_fm,1))] ELSE v_ff[1 + ((v_seq * 5) % array_length(v_ff,1))] END;
      INSERT INTO public.parents (school_id, first_name, last_name, phone, email, address, occupation, status)
      VALUES (v_school_id, v_pfirst, v_plast,
              '+221 76 ' || lpad((200 + v_seq)::text, 3, '0') || ' 00 00',
              lower(v_pfirst) || '.' || lower(v_plast) || v_seq || '@demo.scolatech.app',
              'Dakar, Sénégal', 'Commerçant(e)', 'active')
      RETURNING id INTO v_pid;

      INSERT INTO public.parent_student_links (school_id, parent_id, student_id, relationship, is_primary_contact)
      VALUES (v_school_id, v_pid, v_sid, v_rel, true);
    END LOOP;
  END LOOP;

  -- ── Timetable: each class_subject scheduled once, Mon/Tue 08:00–12:00 ──────
  INSERT INTO public.timetable_slots (school_id, academic_year_id, class_id, class_subject_id, teacher_id, day_of_week, start_time, end_time, room)
  SELECT v_school_id, v_year_id, x.class_id, x.id, tsa.teacher_id,
         (((x.rn - 1) / 4) + 1)::int,
         (TIME '08:00' + (((x.rn - 1) % 4) * INTERVAL '1 hour')),
         (TIME '09:00' + (((x.rn - 1) % 4) * INTERVAL '1 hour')),
         'Salle ' || (((x.rn - 1) % 4) + 1)
  FROM (
    SELECT cs.id, cs.class_id, row_number() OVER (PARTITION BY cs.class_id ORDER BY cs.subject_id) AS rn
    FROM public.class_subjects cs WHERE cs.school_id = v_school_id
  ) x
  LEFT JOIN public.teacher_subject_assignments tsa ON tsa.class_subject_id = x.id;

  -- ── Attendance: up to 8 recent weekdays per class ─────────────────────────
  FOR v_i IN 1 .. v_n_classes LOOP
    v_cid := v_class_ids[v_i];
    v_made := 0;
    FOR v_d IN 1 .. 14 LOOP
      EXIT WHEN v_made >= 8;
      v_date := CURRENT_DATE - v_d;
      v_dow  := EXTRACT(DOW FROM v_date)::int;   -- 0=Sun .. 6=Sat
      CONTINUE WHEN v_dow = 0 OR v_dow = 6;
      INSERT INTO public.attendance_sessions (school_id, class_id, academic_year_id, session_date, notes)
      VALUES (v_school_id, v_cid, v_year_id, v_date, NULL)
      RETURNING id INTO v_session_id;
      v_made := v_made + 1;

      INSERT INTO public.attendance_records (school_id, session_id, student_id, status)
      SELECT v_school_id, v_session_id, e.student_id,
             CASE WHEN random() < 0.88 THEN 'present'
                  WHEN random() < 0.6  THEN 'late'
                  ELSE 'absent' END
      FROM public.student_class_enrollments e
      WHERE e.class_id = v_cid AND e.school_id = v_school_id AND e.status = 'active';
    END LOOP;
  END LOOP;

  -- ── Grades: 2 assessments per class_subject in the active period ──────────
  FOR rec IN
    SELECT id, class_id FROM public.class_subjects WHERE school_id = v_school_id
  LOOP
    INSERT INTO public.assessments (school_id, class_subject_id, academic_period_id, title, assessment_type, coefficient, max_score, assessment_date)
    VALUES (v_school_id, rec.id, v_period_id, 'Devoir 1', 'devoir', 1, 20, v_assess1)
    RETURNING id INTO v_a1;
    INSERT INTO public.assessments (school_id, class_subject_id, academic_period_id, title, assessment_type, coefficient, max_score, assessment_date)
    VALUES (v_school_id, rec.id, v_period_id, 'Composition', 'composition', 2, 20, v_assess2)
    RETURNING id INTO v_a2;

    INSERT INTO public.grades (school_id, assessment_id, student_id, score)
    SELECT v_school_id, v_a1, e.student_id, round((8 + random() * 11)::numeric, 2)
    FROM public.student_class_enrollments e
    WHERE e.class_id = rec.class_id AND e.school_id = v_school_id AND e.status = 'active';

    INSERT INTO public.grades (school_id, assessment_id, student_id, score)
    SELECT v_school_id, v_a2, e.student_id, round((8 + random() * 11)::numeric, 2)
    FROM public.student_class_enrollments e
    WHERE e.class_id = rec.class_id AND e.school_id = v_school_id AND e.status = 'active';
  END LOOP;

  -- ── Finance: tuition fee items, one invoice per student, mixed payment state
  INSERT INTO public.fee_items (school_id, academic_year_id, name, description, amount, due_date, is_active)
  VALUES (v_school_id, v_year_id, 'Frais de scolarité', 'Scolarité annuelle', 120000, CURRENT_DATE + 15, true)
  RETURNING id INTO v_fee_scol;
  INSERT INTO public.fee_items (school_id, academic_year_id, name, description, amount, due_date, is_active)
  VALUES (v_school_id, v_year_id, 'Frais d''inscription', 'Inscription annuelle', 30000, CURRENT_DATE + 15, true)
  RETURNING id INTO v_fee_insc;

  FOR rec IN
    SELECT id, admission_number FROM public.students WHERE school_id = v_school_id ORDER BY admission_number
  LOOP
    v_inv_seq := v_inv_seq + 1;
    INSERT INTO public.student_invoices (school_id, student_id, academic_year_id, invoice_number, title, total_amount, amount_paid, status, due_date)
    VALUES (v_school_id, rec.id, v_year_id, 'INV-' || v_year_name || '-' || lpad(v_inv_seq::text, 4, '0'),
            'Scolarité ' || v_year_name, v_total, 0, 'unpaid', CURRENT_DATE + 15)
    RETURNING id INTO v_inv_id;

    INSERT INTO public.invoice_lines (school_id, invoice_id, fee_item_id, description, amount) VALUES
      (v_school_id, v_inv_id, v_fee_scol, 'Frais de scolarité', 120000),
      (v_school_id, v_inv_id, v_fee_insc, 'Frais d''inscription', 30000);

    v_roll := random();
    IF v_roll < 0.5 THEN
      -- fully paid
      v_rec_seq := v_rec_seq + 1;
      INSERT INTO public.student_payments (school_id, student_id, invoice_id, amount, payment_method, receipt_number, paid_at)
      VALUES (v_school_id, rec.id, v_inv_id, v_total, 'cash', 'REC-' || v_yr || '-' || lpad(v_rec_seq::text, 6, '0'), now() - (random() * 30) * INTERVAL '1 day');
      UPDATE public.student_invoices SET amount_paid = v_total, status = 'paid' WHERE id = v_inv_id;
    ELSIF v_roll < 0.8 THEN
      -- partially paid
      v_rec_seq := v_rec_seq + 1;
      INSERT INTO public.student_payments (school_id, student_id, invoice_id, amount, payment_method, receipt_number, paid_at)
      VALUES (v_school_id, rec.id, v_inv_id, 75000, 'wave_manual', 'REC-' || v_yr || '-' || lpad(v_rec_seq::text, 6, '0'), now() - (random() * 30) * INTERVAL '1 day');
      UPDATE public.student_invoices SET amount_paid = 75000, status = 'partial' WHERE id = v_inv_id;
    END IF;
    -- else: left unpaid
  END LOOP;

  -- ── Transport: vehicles, drivers, routes, stops, assignments ──────────────
  INSERT INTO public.transport_vehicles (school_id, name, registration_plate, make, model, capacity, status, insurance_expiry_date, inspection_expiry_date)
  VALUES (v_school_id, 'Bus 1 — Ligne Nord', 'DK-1001-AA', 'Toyota', 'Coaster', 30, 'active', CURRENT_DATE + 20, CURRENT_DATE + 120)
  RETURNING id INTO v_veh1;
  INSERT INTO public.transport_vehicles (school_id, name, registration_plate, make, model, capacity, status, insurance_expiry_date, inspection_expiry_date)
  VALUES (v_school_id, 'Bus 2 — Ligne Sud', 'DK-1002-BB', 'Mercedes', 'Sprinter', 22, 'active', CURRENT_DATE + 200, CURRENT_DATE - 5)
  RETURNING id INTO v_veh2;
  INSERT INTO public.transport_vehicles (school_id, name, registration_plate, make, model, capacity, status, insurance_expiry_date, inspection_expiry_date)
  VALUES (v_school_id, 'Minibus de réserve', 'DK-1003-CC', 'Toyota', 'Hiace', 15, 'maintenance', CURRENT_DATE + 300, CURRENT_DATE + 300)
  RETURNING id INTO v_veh3;

  INSERT INTO public.transport_drivers (school_id, full_name, phone, license_number, license_expiry_date, emergency_contact_name, emergency_contact_phone, status)
  VALUES (v_school_id, 'Moussa Diallo', '+221 77 555 10 10', 'SN-DRV-0001', CURRENT_DATE + 18, 'Awa Diallo', '+221 76 555 20 20', 'active')
  RETURNING id INTO v_drv1;
  INSERT INTO public.transport_drivers (school_id, full_name, phone, license_number, license_expiry_date, emergency_contact_name, emergency_contact_phone, status)
  VALUES (v_school_id, 'Cheikh Sarr', '+221 77 555 11 11', 'SN-DRV-0002', CURRENT_DATE + 400, 'Fatou Sarr', '+221 76 555 21 21', 'active')
  RETURNING id INTO v_drv2;
  INSERT INTO public.transport_drivers (school_id, full_name, phone, license_number, license_expiry_date, status)
  VALUES (v_school_id, 'Ibrahima Ba', '+221 77 555 12 12', 'SN-DRV-0003', CURRENT_DATE + 90, 'inactive')
  RETURNING id INTO v_drv3;

  INSERT INTO public.transport_routes (school_id, name, description, vehicle_id, driver_id, status, monthly_fee)
  VALUES (v_school_id, 'Ligne Nord — Parcelles', 'Parcelles Assainies → Collège', v_veh1, v_drv1, 'active', 15000)
  RETURNING id INTO v_rt1;
  INSERT INTO public.transport_routes (school_id, name, description, vehicle_id, driver_id, status, monthly_fee)
  VALUES (v_school_id, 'Ligne Sud — Liberté', 'Liberté 6 → Collège', v_veh2, v_drv2, 'active', 18000)
  RETURNING id INTO v_rt2;

  INSERT INTO public.transport_stops (school_id, route_id, name, pickup_time, dropoff_time, stop_order) VALUES
    (v_school_id, v_rt1, 'Parcelles U.13',  TIME '06:45', TIME '17:15', 1),
    (v_school_id, v_rt1, 'Parcelles U.26',  TIME '06:55', TIME '17:05', 2),
    (v_school_id, v_rt1, 'Carrefour Cambérène', TIME '07:10', TIME '16:50', 3),
    (v_school_id, v_rt2, 'Liberté 6',       TIME '06:50', TIME '17:10', 1),
    (v_school_id, v_rt2, 'Sacré-Cœur 3',    TIME '07:05', TIME '16:55', 2),
    (v_school_id, v_rt2, 'Mermoz',          TIME '07:15', TIME '16:45', 3);

  SELECT id INTO v_stop1 FROM public.transport_stops WHERE route_id = v_rt1 ORDER BY stop_order LIMIT 1;
  SELECT id INTO v_stop2 FROM public.transport_stops WHERE route_id = v_rt2 ORDER BY stop_order LIMIT 1;

  -- assign the first 10 students to Ligne Nord, next 10 to Ligne Sud
  INSERT INTO public.student_transport_assignments (school_id, student_id, route_id, stop_id, monthly_fee, start_date, status)
  SELECT v_school_id, s.id, v_rt1, v_stop1, 15000, v_year_start, 'active'
  FROM (SELECT id, row_number() OVER (ORDER BY admission_number) AS rn FROM public.students WHERE school_id = v_school_id) s
  WHERE s.rn BETWEEN 1 AND 10;

  INSERT INTO public.student_transport_assignments (school_id, student_id, route_id, stop_id, monthly_fee, start_date, status)
  SELECT v_school_id, s.id, v_rt2, v_stop2, 18000, v_year_start, 'active'
  FROM (SELECT id, row_number() OVER (ORDER BY admission_number) AS rn FROM public.students WHERE school_id = v_school_id) s
  WHERE s.rn BETWEEN 11 AND 20;

  RAISE NOTICE 'Demo school % created (slug=%).', v_school_id, v_demo_slug;
END $$;

-- ============================================================================
-- Verification (read-only) — counts for the demo school only.
-- ============================================================================
WITH s AS (SELECT id FROM public.schools WHERE slug = 'scolatech-pilot-demo')
SELECT 'classes'      AS entity, count(*) FROM public.classes                    WHERE school_id = (SELECT id FROM s)
UNION ALL SELECT 'subjects',        count(*) FROM public.subjects                 WHERE school_id = (SELECT id FROM s)
UNION ALL SELECT 'teachers',        count(*) FROM public.teachers                 WHERE school_id = (SELECT id FROM s)
UNION ALL SELECT 'students',        count(*) FROM public.students                 WHERE school_id = (SELECT id FROM s)
UNION ALL SELECT 'parents',         count(*) FROM public.parents                  WHERE school_id = (SELECT id FROM s)
UNION ALL SELECT 'enrollments',     count(*) FROM public.student_class_enrollments WHERE school_id = (SELECT id FROM s)
UNION ALL SELECT 'timetable_slots', count(*) FROM public.timetable_slots          WHERE school_id = (SELECT id FROM s)
UNION ALL SELECT 'attendance_rec',  count(*) FROM public.attendance_records       WHERE school_id = (SELECT id FROM s)
UNION ALL SELECT 'assessments',     count(*) FROM public.assessments              WHERE school_id = (SELECT id FROM s)
UNION ALL SELECT 'grades',          count(*) FROM public.grades                   WHERE school_id = (SELECT id FROM s)
UNION ALL SELECT 'invoices',        count(*) FROM public.student_invoices         WHERE school_id = (SELECT id FROM s)
UNION ALL SELECT 'payments',        count(*) FROM public.student_payments         WHERE school_id = (SELECT id FROM s)
UNION ALL SELECT 'transport_veh',   count(*) FROM public.transport_vehicles       WHERE school_id = (SELECT id FROM s)
UNION ALL SELECT 'transport_routes',count(*) FROM public.transport_routes         WHERE school_id = (SELECT id FROM s)
UNION ALL SELECT 'transport_assign',count(*) FROM public.student_transport_assignments WHERE school_id = (SELECT id FROM s)
ORDER BY entity;

-- ============================================================================
-- PART 2 (OPTIONAL) — let a real login explore the demo school.
-- Grants an ACTIVE school_admin membership on the demo school to the account
-- below WITHOUT changing its global_role. Skips silently if the user hasn't
-- signed up yet. Comment this out if you don't want any account linked.
-- ============================================================================
DO $$
DECLARE
  v_email     text := 'seckbara23@gmail.com';   -- 👈 change to the account that will demo it
  v_user_id   uuid;
  v_school_id uuid;
BEGIN
  SELECT id INTO v_school_id FROM public.schools WHERE slug = 'scolatech-pilot-demo' LIMIT 1;
  IF v_school_id IS NULL THEN
    RAISE NOTICE 'Demo school not found — run Part 1 first.'; RETURN;
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email) LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No auth user for % — sign up once, then re-run Part 2.', v_email; RETURN;
  END IF;

  INSERT INTO public.profiles (id, email) VALUES (v_user_id, v_email)
  ON CONFLICT (id) DO NOTHING;  -- never overwrites an existing global_role

  INSERT INTO public.school_memberships (user_id, school_id, role, status)
  VALUES (v_user_id, v_school_id, 'school_admin', 'active')
  ON CONFLICT (user_id, school_id, role) DO UPDATE SET status = 'active', updated_at = now();

  RAISE NOTICE 'Linked % as school_admin on the demo school.', v_email;
END $$;
