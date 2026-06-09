import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ImportSubjectsClient } from './_client'

export default async function ImportSubjectsPage() {
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

  const { data: subjects } = await supabase.from('subjects').select('name').eq('school_id', schoolId)
  const existing = ((subjects ?? []) as { name: string }[]).map((s) => s.name.trim().toLowerCase())

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/academics/subjects" className="text-primary-300 hover:text-white text-sm">← Matières</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Importer des matières</h1>
        <p className="text-primary-300 text-sm mt-0.5">Importez une liste de matières depuis un fichier CSV (compatible Excel)</p>
      </div>

      <ImportSubjectsClient existing={existing} />
    </div>
  )
}
