import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { EditSubjectForm } from './_form'

type Props = { params: { subjectId: string } }

export default async function EditSubjectPage({ params }: Props) {
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

  const { data: subjectData } = await supabase
    .from('subjects')
    .select('id, name, code, coefficient')
    .eq('id', params.subjectId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!subjectData) notFound()

  type Subject = { id: string; name: string; code: string | null; coefficient: number | null }
  const subject = subjectData as Subject

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/academics/subjects" className="text-primary-300 hover:text-white text-sm">
            ← Matières
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Modifier la matière</h1>
        <p className="text-primary-300 text-sm mt-0.5">{subject.name}</p>
      </div>

      {/* ── Form card ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <EditSubjectForm subject={subject} />
      </div>

    </div>
  )
}
