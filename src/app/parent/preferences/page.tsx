import { requireParentCtx } from '../_auth'
import { DEFAULT_CHANNELS } from '@/lib/comms/preferences'
import { CommPreferencesForm } from '@/components/comms/CommPreferencesForm'

export const dynamic = 'force-dynamic'

const CATS = ['finance', 'attendance', 'academic', 'announcements', 'marketing'] as const
const CHS = ['email', 'sms', 'whatsapp'] as const

export default async function ParentPreferencesPage({ searchParams }: { searchParams: { prefs?: string } }) {
  const { supabase, schoolId, userId } = await requireParentCtx()
  const { data } = await supabase.from('communication_preferences').select('category, channel, opted_in').eq('school_id', schoolId).eq('user_id', userId)
  const pmap = new Map(((data ?? []) as { category: string; channel: string; opted_in: boolean }[]).map((p) => [`${p.category}:${p.channel}`, p.opted_in]))
  const initial: Record<string, boolean> = {}
  for (const cat of CATS) for (const ch of CHS) initial[`${cat}_${ch}`] = pmap.has(`${cat}:${ch}`) ? pmap.get(`${cat}:${ch}`)! : DEFAULT_CHANNELS[cat].includes(ch)

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      <div><h1 className="text-2xl font-bold tracking-tight text-gray-900">Préférences de communication</h1><p className="text-sm text-gray-500">Choisissez comment l’école vous contacte.</p></div>
      {searchParams.prefs && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Préférences enregistrées.</div>}
      <CommPreferencesForm redirectTo="/parent/preferences" initial={initial} />
    </div>
  )
}
