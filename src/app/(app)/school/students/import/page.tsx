import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ImportStudentsClient } from './_client'

export default async function ImportStudentsPage() {
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

  const [studentsRes, classesRes] = await Promise.all([
    supabase.from('students').select('admission_number').eq('school_id', schoolId),
    supabase
      .from('classes')
      .select('id, name, section, academic_years!academic_year_id(name, is_active)')
      .eq('school_id', schoolId)
      .order('name'),
  ])

  const existing = ((studentsRes.data ?? []) as { admission_number: string }[]).map((s) => s.admission_number.trim().toLowerCase())

  type ClassRow = { id: string; name: string; section: string | null; academic_years: { name: string; is_active: boolean } | null }
  const classes = ((classesRes.data ?? []) as unknown as ClassRow[]).map((c) => ({
    id: c.id,
    label: `${[c.name, c.section].filter(Boolean).join(' ')} — ${c.academic_years?.name ?? ''}${c.academic_years?.is_active ? ' (active)' : ''}`,
  }))

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/students" className="text-primary-300 hover:text-white text-sm">← Élèves</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Importer des élèves</h1>
        <p className="text-primary-300 text-sm mt-0.5">Importez une liste d&apos;élèves depuis un fichier CSV ou Excel (.xlsx)</p>
      </div>

      <ImportStudentsClient existing={existing} classes={classes} />
    </div>
  )
}
