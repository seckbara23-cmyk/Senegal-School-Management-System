import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { loadGenerationData } from './_data'
import { GenerateWizard } from './_client'

type Props = { searchParams: { year?: string } }

export default async function GenerateTimetablePage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: yearsData } = await supabase
    .from('academic_years').select('id, name, is_active').eq('school_id', schoolId).order('starts_on', { ascending: false })
  const years = (yearsData ?? []) as { id: string; name: string; is_active: boolean }[]

  const selectedYear = searchParams.year && years.some((y) => y.id === searchParams.year)
    ? searchParams.year
    : (years.find((y) => y.is_active)?.id ?? years[0]?.id ?? null)

  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/timetable" className="text-primary-300 hover:text-white text-sm">← Emploi du temps</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Générateur intelligent</h1>
        <p className="text-primary-300 text-sm mt-0.5">Proposez un emploi du temps sans conflit, puis enregistrez.</p>
      </div>

      {years.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-14 text-center">
          <p className="text-sm font-medium text-gray-900">Aucune année scolaire</p>
          <p className="mt-1 text-sm text-gray-500">Créez d&apos;abord une année scolaire active.</p>
          <a href="/school/academic-years/new" className="mt-4 inline-flex rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">+ Année scolaire</a>
        </div>
      ) : (
        <>
          {/* Year selector */}
          {years.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {years.map((y) => (
                <a key={y.id} href={`/school/timetable/generate?year=${y.id}`}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    y.id === selectedYear ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'
                  }`}>
                  {y.name}{y.is_active ? ' ·  active' : ''}
                </a>
              ))}
            </div>
          )}

          {selectedYear && <WizardLoader supabase={supabase} schoolId={schoolId} yearId={selectedYear} />}
        </>
      )}
    </div>
  )
}

async function WizardLoader({ supabase, schoolId, yearId }: { supabase: ReturnType<typeof createClient>; schoolId: string; yearId: string }) {
  const [data, statusRes] = await Promise.all([
    loadGenerationData(supabase, schoolId, yearId),
    supabase.from('timetable_status').select('status').eq('school_id', schoolId).eq('academic_year_id', yearId).maybeSingle(),
  ])
  const status = ((statusRes.data as { status: 'draft' | 'published' | 'locked' } | null)?.status) ?? null

  if (data.classes.length === 0 || data.classSubjects.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        Pour générer un emploi du temps, créez des classes et associez-leur des matières (avec un volume horaire) dans{' '}
        <a href="/school/classes" className="font-semibold underline">Classes</a>.
      </div>
    )
  }

  return (
    <GenerateWizard
      yearId={yearId}
      classes={data.classes}
      classSubjects={data.classSubjects}
      teachers={data.teachers}
      availability={data.availability}
      existing={data.existing}
      status={status}
    />
  )
}
