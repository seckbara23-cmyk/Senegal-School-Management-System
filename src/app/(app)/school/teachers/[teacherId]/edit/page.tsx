import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { EditTeacherForm } from './_form'

type Props = {
  params: { teacherId: string }
}

export default async function EditTeacherPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminMembership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!adminMembership) redirect('/school')
  const schoolId = (adminMembership as { school_id: string }).school_id

  const { data: teacherData } = await supabase
    .from('teachers')
    .select('id, first_name, last_name, employee_number, phone, email')
    .eq('id', params.teacherId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!teacherData) notFound()

  type Teacher = {
    id: string; first_name: string; last_name: string
    employee_number: string; phone: string | null; email: string | null
  }
  const teacher = teacherData as Teacher

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href={`/school/teachers/${teacher.id}`} className="text-primary-300 hover:text-white text-sm">
            ← {teacher.last_name} {teacher.first_name}
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Modifier le dossier</h1>
        <p className="mt-0.5 text-sm text-primary-300">
          Informations de contact et matricule
        </p>
      </div>

      {/* ── Form card ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <EditTeacherForm teacher={teacher} />
      </div>

    </div>
  )
}
