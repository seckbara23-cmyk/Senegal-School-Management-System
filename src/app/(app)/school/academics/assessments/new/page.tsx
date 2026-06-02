import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NewAssessmentForm } from './_form'

export default async function NewAssessmentPage() {
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

  const [csRes, periodsRes, sessionsRes] = await Promise.all([
    supabase
      .from('class_subjects')
      .select('id, academic_year_id, classes!class_id(name, level), subjects!subject_id(name, code)')
      .eq('school_id', schoolId)
      .order('classes(name)', { ascending: true }),

    supabase
      .from('academic_periods')
      .select('id, name, academic_years!academic_year_id(name)')
      .eq('school_id', schoolId)
      .order('name', { ascending: true }),

    supabase
      .from('exam_sessions')
      .select('id, name, academic_year_id, status, academic_years!academic_year_id(name)')
      .eq('school_id', schoolId)
      .in('status', ['draft', 'active'])
      .order('starts_on', { ascending: false }),
  ])

  type CSRow = {
    id: string
    academic_year_id: string
    classes:  { name: string; level: string | null }
    subjects: { name: string; code: string | null }
  }
  type PeriodRow = { id: string; name: string; academic_years: { name: string } }
  type SessionRow = { id: string; name: string; academic_year_id: string; status: string; academic_years: { name: string } | null }

  const rawCS = (csRes.data ?? []) as unknown as CSRow[]
  const classSubjects = rawCS.map((cs) => ({
    id:             cs.id,
    className:      cs.classes.name + (cs.classes.level ? ` (${cs.classes.level})` : ''),
    subjectName:    cs.subjects.name,
    subjectCode:    cs.subjects.code,
    academicYearId: cs.academic_year_id,
  }))

  const periods = ((periodsRes.data ?? []) as unknown as PeriodRow[]).map((p) => ({
    id:       p.id,
    name:     p.name,
    yearName: p.academic_years.name,
  }))

  const examSessions = ((sessionsRes.data ?? []) as unknown as SessionRow[]).map((s) => ({
    id:             s.id,
    label:          `${s.name}${s.academic_years ? ` — ${s.academic_years.name}` : ''}${s.status === 'draft' ? ' (brouillon)' : ''}`,
    academicYearId: s.academic_year_id,
  }))

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/academics/assessments" className="text-primary-300 hover:text-white text-sm">← Évaluations</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Nouvelle évaluation</h1>
        <p className="text-primary-300 text-sm mt-0.5">Créer une évaluation et saisir les notes</p>
      </div>

      {/* ── Form card ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <NewAssessmentForm classSubjects={classSubjects} periods={periods} examSessions={examSessions} />
      </div>

    </div>
  )
}
