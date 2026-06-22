import { createClient }        from '@/lib/supabase/server'
import { notFound, redirect }   from 'next/navigation'
import { EditAcademicYearForm } from './_form'

type Props = { params: { yearId: string } }

export default async function EditAcademicYearPage({ params }: Props) {
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

  const { data: yearData } = await supabase
    .from('academic_years')
    .select('id, name, starts_on, ends_on, is_active')
    .eq('id', params.yearId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!yearData) notFound()

  type Year = {
    id: string; name: string; starts_on: string; ends_on: string; is_active: boolean
  }
  const year = yearData as Year

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a
            href={`/school/academic-years/${year.id}`}
            className="text-primary-300 hover:text-white text-sm transition-colors"
          >
            ← {year.name}
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Modifier l&apos;année scolaire</h1>
        <p className="mt-0.5 text-sm text-primary-300">
          Nom, dates et statut
        </p>
      </div>

      {/* ── Form card ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <EditAcademicYearForm year={year} />
      </div>

    </div>
  )
}
