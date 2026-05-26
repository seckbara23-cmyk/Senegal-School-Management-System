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

  const [subjectsRes, assignmentsRes, teachersRes] = await Promise.all([
    supabase
      .from('subjects')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId),

    supabase
      .from('class_subjects')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId),

    supabase
      .from('teacher_subject_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId),
  ])

  const subjectCount    = subjectsRes.count    ?? 0
  const assignmentCount = assignmentsRes.count ?? 0
  const teacherCount    = teachersRes.count    ?? 0

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Académique</h1>
        <p className="text-primary-300 text-sm mt-0.5">Matières, classes et enseignants</p>
      </div>

      {/* ── Stat strip ──────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl grid grid-cols-3 shadow-sm">
        <div className="bg-primary-600 px-5 py-5 text-center">
          <p className="text-3xl font-bold text-white">{subjectCount}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-1">Matières</p>
        </div>
        <div className="bg-primary-700 px-5 py-5 text-center">
          <p className="text-3xl font-bold text-white">{assignmentCount}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-300 mt-1">Attributions</p>
        </div>
        <div className="bg-accent-600 px-5 py-5 text-center">
          <p className="text-3xl font-bold text-white">{teacherCount}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-200 mt-1">Enseignants assignés</p>
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
          href="/school/academics/subjects/new"
          className="group flex items-start gap-4 rounded-xl border border-dashed border-sand-300 bg-sand-50 px-5 py-5 hover:border-primary-400 hover:bg-white transition-all sm:col-span-2"
        >
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-gray-400 group-hover:text-primary-600 transition-colors shadow-sm">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-700 group-hover:text-primary-700">Créer une matière</p>
            <p className="mt-0.5 text-sm text-gray-400">Ajouter une nouvelle matière au catalogue</p>
          </div>
        </a>
      </div>

    </div>
  )
}
