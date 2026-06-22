import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TemplatesClient } from './_client'

export default async function ClassTemplatesPage() {
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

  const [yearsRes, classesRes] = await Promise.all([
    supabase.from('academic_years').select('id, name, is_active').eq('school_id', schoolId).order('starts_on', { ascending: false }),
    supabase.from('classes').select('name, academic_year_id').eq('school_id', schoolId),
  ])
  type YearRow = { id: string; name: string; is_active: boolean }
  const years = (yearsRes.data ?? []) as YearRow[]

  // Existing class names per year (lowercased) for duplicate preview.
  const existingByYear: Record<string, string[]> = {}
  for (const c of (classesRes.data ?? []) as { name: string; academic_year_id: string }[]) {
    ;(existingByYear[c.academic_year_id] ??= []).push(c.name.trim().toLowerCase())
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/classes" className="text-primary-300 hover:text-white text-sm">← Classes</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Création rapide</h1>
        <p className="text-primary-300 text-sm mt-0.5">Créez toute une structure de classes en une fois à partir d&apos;un modèle</p>
      </div>

      {years.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune année scolaire</p>
          <p className="mt-1 text-sm text-gray-400">Créez d&apos;abord une année scolaire pour y ajouter des classes.</p>
          <a href="/school/academic-years/new" className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors">Créer une année scolaire</a>
        </div>
      ) : (
        <TemplatesClient
          years={years.map((y) => ({ id: y.id, label: `${y.name}${y.is_active ? ' (active)' : ''}` }))}
          defaultYearId={years.find((y) => y.is_active)?.id ?? years[0]?.id ?? ''}
          existingByYear={existingByYear}
        />
      )}
    </div>
  )
}
