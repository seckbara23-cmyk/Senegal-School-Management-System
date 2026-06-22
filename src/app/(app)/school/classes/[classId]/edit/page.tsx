import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { ClassEditForm } from './_form'

type Props = { params: { classId: string } }

export default async function EditClassPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: classData } = await supabase
    .from('classes')
    .select('id, name, level, section')
    .eq('id', params.classId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!classData) notFound()
  const cls = classData as { id: string; name: string; level: string | null; section: string | null }

  const displayName = [cls.name, cls.section].filter(Boolean).join(' — ')

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href={`/school/classes/${cls.id}`} className="text-primary-300 hover:text-white text-sm">← {displayName}</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Modifier la classe</h1>
      </div>

      <div className="max-w-2xl rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <ClassEditForm cls={cls} />
      </div>
    </div>
  )
}
