import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AcademicsPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const [subjectsRes, assignmentsRes, periodsRes, assessmentsRes] = await Promise.all([
    supabase
      .from('subjects')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId),

    supabase
      .from('class_subjects')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId),

    supabase
      .from('academic_periods')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId),

    supabase
      .from('assessments')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId),
  ])

  const subjectCount    = subjectsRes.count    ?? 0
  const assignmentCount = assignmentsRes.count ?? 0
  const periodCount     = periodsRes.count     ?? 0
  const assessmentCount = assessmentsRes.count ?? 0

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Académique</h1>
        <p className="text-primary-300 text-sm mt-0.5">Matières, périodes, évaluations et notes</p>
      </div>

      {/* ── Stat strip ──────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl grid grid-cols-2 sm:grid-cols-4 shadow-sm">
        <div className="bg-primary-600 px-5 py-5 text-center">
          <p className="text-3xl font-bold text-white">{subjectCount}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-1">Matières</p>
        </div>
        <div className="bg-primary-700 px-5 py-5 text-center">
          <p className="text-3xl font-bold text-white">{assignmentCount}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-300 mt-1">Attributions</p>
        </div>
        <div className="bg-accent-600 px-5 py-5 text-center">
          <p className="text-3xl font-bold text-white">{periodCount}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-200 mt-1">Périodes</p>
        </div>
        <div className="bg-accent-700 px-5 py-5 text-center">
          <p className="text-3xl font-bold text-white">{assessmentCount}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-300 mt-1">Évaluations</p>
        </div>
      </div>

      {/* ── Quick actions ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        <a
          href="/school/academics/dashboard"
          className="group flex items-start gap-4 rounded-xl border border-primary-200 bg-primary-50 px-5 py-5 shadow-sm hover:border-primary-400 hover:shadow-md transition-all sm:col-span-2"
        >
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-primary-900">Tableau de bord académique</p>
            <p className="mt-0.5 text-sm text-primary-700/70">Suivi des notes, saisie en attente et moyennes par classe</p>
            <p className="mt-2 text-xs font-medium text-primary-700">Voir le tableau de bord →</p>
          </div>
        </a>

        <a
          href="/school/academics/subjects"
          className="group flex items-start gap-4 rounded-xl border border-sand-200 bg-white px-5 py-5 shadow-sm hover:border-primary-300 hover:shadow-md transition-all"
        >
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700 group-hover:bg-primary-600 group-hover:text-white transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.966 8.966 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Catalogue des matières</p>
            <p className="mt-0.5 text-sm text-gray-500">Créer et gérer les matières de l&apos;école</p>
            <p className="mt-2 text-xs font-medium text-primary-600">{subjectCount} matière{subjectCount !== 1 ? 's' : ''} →</p>
          </div>
        </a>

        <a
          href="/school/academics/assignments"
          className="group flex items-start gap-4 rounded-xl border border-sand-200 bg-white px-5 py-5 shadow-sm hover:border-primary-300 hover:shadow-md transition-all"
        >
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-100 text-accent-700 group-hover:bg-accent-500 group-hover:text-white transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Attributions classes</p>
            <p className="mt-0.5 text-sm text-gray-500">Assigner matières et enseignants aux classes</p>
            <p className="mt-2 text-xs font-medium text-accent-600">{assignmentCount} attribution{assignmentCount !== 1 ? 's' : ''} →</p>
          </div>
        </a>

        <a
          href="/school/academics/periods"
          className="group flex items-start gap-4 rounded-xl border border-sand-200 bg-white px-5 py-5 shadow-sm hover:border-primary-300 hover:shadow-md transition-all"
        >
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 group-hover:bg-sky-600 group-hover:text-white transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Périodes académiques</p>
            <p className="mt-0.5 text-sm text-gray-500">Trimestres et semestres</p>
            <p className="mt-2 text-xs font-medium text-sky-600">{periodCount} période{periodCount !== 1 ? 's' : ''} →</p>
          </div>
        </a>

        <a
          href="/school/academics/assessments"
          className="group flex items-start gap-4 rounded-xl border border-sand-200 bg-white px-5 py-5 shadow-sm hover:border-primary-300 hover:shadow-md transition-all"
        >
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 3.75 3.75 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Évaluations et notes</p>
            <p className="mt-0.5 text-sm text-gray-500">Saisir et consulter les notes</p>
            <p className="mt-2 text-xs font-medium text-emerald-600">{assessmentCount} évaluation{assessmentCount !== 1 ? 's' : ''} →</p>
          </div>
        </a>

        <a
          href="/school/academics/rankings"
          className="group flex items-start gap-4 rounded-xl border border-sand-200 bg-white px-5 py-5 shadow-sm hover:border-primary-300 hover:shadow-md transition-all sm:col-span-2"
        >
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-700 group-hover:bg-accent-400 group-hover:text-white transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.504-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Classement &amp; performance</p>
            <p className="mt-0.5 text-sm text-gray-500">Registre des résultats et rang des élèves par classe</p>
            <p className="mt-2 text-xs font-medium text-accent-700">Établir le classement →</p>
          </div>
        </a>

        <a
          href="/school/academics/assessments/new"
          className="group flex items-start gap-4 rounded-xl border border-dashed border-sand-300 bg-sand-50 px-5 py-5 hover:border-primary-400 hover:bg-white transition-all sm:col-span-2"
        >
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-gray-400 group-hover:text-primary-600 transition-colors shadow-sm">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-700 group-hover:text-primary-700">Nouvelle évaluation</p>
            <p className="mt-0.5 text-sm text-gray-400">Créer un devoir, examen ou composition</p>
          </div>
        </a>

      </div>

    </div>
  )
}
