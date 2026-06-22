import { createAdminClient } from '@/lib/supabase/admin'
import { StartForm } from './_start_form'
import { Stepper } from './_stepper'

export const dynamic = 'force-dynamic'

function Closed() {
  return (
    <div className="rounded-xl border border-sand-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-lg font-bold text-gray-900">Candidatures fermées</h1>
      <p className="mt-2 text-sm text-gray-500">Les candidatures en ligne ne sont pas ouvertes pour cette école pour le moment. Contactez directement l’établissement.</p>
    </div>
  )
}

export default async function ApplyPage({ params }: { params: { slug: string } }) {
  const admin = createAdminClient()
  const { data: schoolRaw } = await admin
    .from('schools').select('id, name, admissions_enabled, admissions_intro, subscription_status').eq('admissions_slug', params.slug).maybeSingle()
  const school = schoolRaw as { id: string; name: string; admissions_enabled: boolean; admissions_intro: string | null; subscription_status: string | null } | null
  if (!school || !school.admissions_enabled || school.subscription_status === 'suspended' || school.subscription_status === 'archived') {
    return <Closed />
  }

  const { data: yr } = await admin.from('academic_years').select('id').eq('school_id', school.id).eq('is_active', true).maybeSingle()
  let classes: { id: string; name: string; section: string | null }[] = []
  if (yr) {
    const { data } = await admin.from('classes').select('id, name, section').eq('school_id', school.id).eq('academic_year_id', (yr as { id: string }).id).order('name')
    classes = (data ?? []) as { id: string; name: string; section: string | null }[]
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{school.name}</h1>
        <p className="text-sm text-gray-500">Formulaire de candidature</p>
      </div>
      <Stepper current={1} />
      {school.admissions_intro && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 whitespace-pre-wrap">{school.admissions_intro}</div>
      )}
      <StartForm slug={params.slug} classes={classes.map((c) => ({ id: c.id, label: [c.name, c.section].filter(Boolean).join(' ') }))} />
    </div>
  )
}
