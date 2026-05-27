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
