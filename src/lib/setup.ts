// ─── School setup state (fully derived, never persisted) ──────────────────────
//
// getSetupState recomputes first-time-setup progress from live data every time
// it is called — there is NO onboarding_completed column. Each step's `done`
// flag is a simple count/exists check scoped to the school. The launch gate is
// "required-only": Parents and Transport are optional (they show their own ✓ but
// do not block "Prêt à lancer"). Shared by the setup hub and the dashboard card.

import type { createClient } from '@/lib/supabase/server'

type SchoolClient = ReturnType<typeof createClient>

export type SetupStepKey =
  | 'profile' | 'academic_year' | 'classes' | 'subjects' | 'teachers'
  | 'students' | 'parents' | 'assignments' | 'transport' | 'admissions' | 'review'

export type SetupStep = {
  key:      SetupStepKey
  number:   number
  title:    string
  desc:     string
  href:     string
  done:     boolean
  optional: boolean
}

export type SetupState = {
  steps:         SetupStep[]
  requiredTotal: number
  requiredDone:  number
  percent:       number   // 0–100, required-only
  ready:         boolean  // all required steps done
}

// Count helper: head+exact count, scoped to the school. Returns 0 on any error
// (e.g. the transport tables not existing yet because migration 043 is unapplied)
// so a missing optional module can never break setup.
async function countRows(supabase: SchoolClient, table: string, schoolId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from(table).select('id', { count: 'exact', head: true }).eq('school_id', schoolId)
    return error ? 0 : (count ?? 0)
  } catch {
    return 0
  }
}

export async function getSetupState(supabase: SchoolClient, schoolId: string): Promise<SetupState> {
  // School profile fields (contact info entered = step done).
  const profileP = supabase
    .from('schools').select('phone, email, address').eq('id', schoolId).maybeSingle()
    .then(({ data }) => {
      const s = data as { phone: string | null; email: string | null; address: string | null } | null
      return !!(s && (s.phone || s.email || s.address))
    }, () => false)

  // Active academic year (the only count needing an extra filter).
  const activeYearP = supabase
    .from('academic_years').select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId).eq('is_active', true)
    .then(({ count, error }) => (error ? 0 : (count ?? 0)), () => 0)

  // Public admissions enabled flag (null-safe: 055 may be absent).
  const admissionsEnabledP = supabase
    .from('schools').select('admissions_enabled').eq('id', schoolId).maybeSingle()
    .then(({ data }) => !!(data as { admissions_enabled?: boolean } | null)?.admissions_enabled, () => false)

  const [
    profileDone,
    activeYear, classes, subjects, teachers, students, parents, assignments,
    vehicles, routes, admissions, admissionsEnabled,
  ] = await Promise.all([
    profileP,
    activeYearP,
    countRows(supabase, 'classes', schoolId),
    countRows(supabase, 'subjects', schoolId),
    countRows(supabase, 'teachers', schoolId),
    countRows(supabase, 'students', schoolId),
    countRows(supabase, 'parents', schoolId),
    countRows(supabase, 'class_subjects', schoolId),
    countRows(supabase, 'transport_vehicles', schoolId),     // null-safe (043 may be absent)
    countRows(supabase, 'transport_routes', schoolId),       // null-safe
    countRows(supabase, 'admission_applications', schoolId), // null-safe
    admissionsEnabledP,
  ])

  const baseSteps: Omit<SetupStep, 'number' | 'done'>[] = [
    { key: 'profile',       title: "Profil de l'école",       desc: "Coordonnées de l'établissement.",            href: '/school/settings',            optional: false },
    { key: 'academic_year', title: 'Année scolaire',          desc: "Créez et activez l'année en cours.",         href: '/school/academic-years',      optional: false },
    { key: 'classes',       title: 'Classes',                 desc: 'Créez les classes et leurs niveaux.',        href: '/school/classes',             optional: false },
    { key: 'subjects',      title: 'Matières',                desc: 'Définissez les matières enseignées.',        href: '/school/academics/subjects',  optional: false },
    { key: 'teachers',      title: 'Enseignants',             desc: 'Ajoutez le corps enseignant.',               href: '/school/teachers',            optional: false },
    { key: 'students',      title: 'Élèves',                  desc: 'Inscrivez les élèves.',                      href: '/school/students',            optional: false },
    { key: 'parents',       title: 'Parents',                 desc: 'Ajoutez les parents et tuteurs.',            href: '/school/parents',             optional: true  },
    { key: 'assignments',   title: 'Matières par classe',     desc: 'Associez matières et enseignants aux classes.', href: '/school/classes',          optional: false },
    { key: 'transport',     title: 'Transport',               desc: 'Véhicules, chauffeurs et itinéraires.',      href: '/school/transport',           optional: true  },
    { key: 'admissions',    title: 'Candidatures en ligne',   desc: 'Ouvrez une page publique de candidature.',   href: '/school/admissions/settings', optional: true  },
    { key: 'review',        title: 'Vérification & lancement', desc: 'Vérifiez et lancez votre espace.',          href: '/school/setup',               optional: false },
  ]

  const doneByKey: Record<SetupStepKey, boolean> = {
    profile:       await profileDone,
    academic_year: activeYear > 0,
    classes:       classes > 0,
    subjects:      subjects > 0,
    teachers:      teachers > 0,
    students:      students > 0,
    parents:       parents > 0,
    assignments:   assignments > 0,
    transport:     vehicles > 0 || routes > 0,
    admissions:    admissionsEnabled || admissions > 0,
    review:        false, // resolved below once required steps are known
  }

  // Required steps that gate the launch (everything except parents, transport,
  // and review itself).
  const requiredKeys = baseSteps.filter((s) => !s.optional && s.key !== 'review').map((s) => s.key)
  const requiredDone = requiredKeys.filter((k) => doneByKey[k]).length
  const requiredTotal = requiredKeys.length
  const ready = requiredDone === requiredTotal
  doneByKey.review = ready

  const steps: SetupStep[] = baseSteps.map((s, i) => ({ ...s, number: i + 1, done: doneByKey[s.key] }))

  return {
    steps,
    requiredTotal,
    requiredDone,
    percent: Math.round((requiredDone / requiredTotal) * 100),
    ready,
  }
}
