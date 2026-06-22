import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { ExamSessionForm, type AcademicYearOption, type ExamSessionInitial } from '../../_form'
import { updateExamSession } from '../../actions'

type Props = { params: { sessionId: string } }

export default async function EditExamSessionPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: rawSession } = await supabase
    .from('exam_sessions')
    .select('id, academic_year_id, name, description, starts_on, ends_on, status')
    .eq('id', params.sessionId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!rawSession) notFound()
  type Row = {
    id: string; academic_year_id: string; name: string; description: string | null
    starts_on: string; ends_on: string; status: string
  }
  const s = rawSession as Row
  if (s.status === 'archived') redirect(`/school/exams/${s.id}`)

  const { data: yearsData } = await supabase
    .from('academic_years').select('id, name, starts_on').eq('school_id', schoolId).order('starts_on', { ascending: false })
  const academicYears: AcademicYearOption[] = ((yearsData ?? []) as { id: string; name: string }[]).map((y) => ({ id: y.id, label: y.name }))

  const initial: ExamSessionInitial = {
    academic_year_id: s.academic_year_id,
    name:             s.name,
    description:      s.description,
    starts_on:        s.starts_on,
    ends_on:          s.ends_on,
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href={`/school/exams/${s.id}`} className="text-primary-300 hover:text-white text-sm">← Session</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Modifier la session</h1>
      </div>

      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <ExamSessionForm
          action={updateExamSession}
          academicYears={academicYears}
          initial={initial}
          sessionId={s.id}
          cancelHref={`/school/exams/${s.id}`}
        />
      </div>
    </div>
  )
}
