import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { enabledChannelsForSchool } from '@/lib/comms/config'
import { BroadcastForm } from './_form'

export const dynamic = 'force-dynamic'

export default async function BroadcastPage({ searchParams }: { searchParams: { sent?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase.from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id
  const enabled = await enabledChannelsForSchool(schoolId)

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/communications" className="text-primary-300 hover:text-white text-sm">← Communication</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Diffuser un message</h1>
        <p className="text-primary-300 text-sm mt-0.5">Envoyez une annonce à une audience. L’in-app est toujours inclus.</p>
      </div>

      {searchParams.sent && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Message diffusé à {searchParams.sent} destinataire(s). L’envoi par canal dépend des préférences de chacun.</div>}

      <BroadcastForm enabledChannels={enabled} />
    </div>
  )
}
