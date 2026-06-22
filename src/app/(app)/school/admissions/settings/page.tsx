import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { AdmissionsSettingsForm } from './_form'

export const dynamic = 'force-dynamic'

type Props = { searchParams: { saved?: string } }

export default async function AdmissionsSettingsPage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: school } = await supabase
    .from('schools').select('name, admissions_enabled, admissions_slug, admissions_intro').eq('id', schoolId).maybeSingle()
  const s = (school ?? {}) as { name?: string; admissions_enabled?: boolean; admissions_slug?: string | null; admissions_intro?: string | null }

  const h = headers()
  const host = h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const origin = host ? `${proto}://${host}` : ''

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/admissions" className="text-primary-300 hover:text-white text-sm">← Admissions</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Candidatures en ligne</h1>
        <p className="text-primary-300 text-sm mt-0.5">Activez une page publique permettant aux familles de candidater en ligne.</p>
      </div>

      {searchParams.saved && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Paramètres enregistrés.</div>
      )}

      <AdmissionsSettingsForm
        enabled={!!s.admissions_enabled}
        slug={s.admissions_slug ?? ''}
        intro={s.admissions_intro ?? ''}
        origin={origin}
        defaultSlug={s.admissions_slug ?? ''}
      />
    </div>
  )
}
