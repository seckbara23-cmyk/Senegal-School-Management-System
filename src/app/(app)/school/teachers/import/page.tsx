import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ImportTeachersClient } from './_client'

export default async function ImportTeachersPage() {
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

  const { data: teachers } = await supabase
    .from('teachers').select('email, first_name, last_name').eq('school_id', schoolId)

  const rows = (teachers ?? []) as { email: string | null; first_name: string; last_name: string }[]
  const existingEmails = rows.filter((t) => t.email).map((t) => t.email!.trim().toLowerCase())
  const existingNames  = rows.map((t) => `${t.first_name}|${t.last_name}`.trim().toLowerCase())

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/teachers" className="text-primary-300 hover:text-white text-sm">← Enseignants</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Importer des enseignants</h1>
        <p className="text-primary-300 text-sm mt-0.5">Importez une liste d&apos;enseignants depuis un fichier CSV ou Excel (.xlsx)</p>
      </div>

      <ImportTeachersClient existingEmails={existingEmails} existingNames={existingNames} />
    </div>
  )
}
