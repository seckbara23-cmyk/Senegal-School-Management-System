import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ExamSessionForm, type AcademicYearOption } from '../_form'
import { createExamSession } from '../actions'

export default async function NewExamSessionPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: yearsData } = await supabase
    .from('academic_years').select('id, name, starts_on').eq('school_id', schoolId).order('starts_on', { ascending: false })
  const academicYears: AcademicYearOption[] = ((yearsData ?? []) as { id: string; name: string }[]).map((y) => ({ id: y.id, label: y.name }))

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/exams" className="text-primary-300 hover:text-white text-sm">← Sessions d&apos;examen</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Nouvelle session d&apos;examen</h1>
      </div>

      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        {academicYears.length === 0 ? (
          <p className="text-sm text-gray-500">Créez d&apos;abord une année scolaire avant de programmer une session d&apos;examen.</p>
        ) : (
          <ExamSessionForm action={createExamSession} academicYears={academicYears} cancelHref="/school/exams" />
        )}
      </div>
    </div>
  )
}
