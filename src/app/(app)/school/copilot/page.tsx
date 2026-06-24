import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CopilotChat } from '@/components/CopilotChat'
import { LanguageSelector } from '@/components/LanguageSelector'
import { resolveLocale } from '@/lib/i18n/server'
import { askCopilot } from './actions'
import { SUGGESTED_PROMPTS } from '@/lib/copilot/intent-router'

export const dynamic = 'force-dynamic'

export default async function CopilotPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('school_memberships').select('school_id, schools!school_id(name)')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolName = ((membership as unknown as { schools: { name: string } | null }).schools?.name) ?? ''

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <a href="/school" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
          <LanguageSelector active={resolveLocale()} next="/school/copilot" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Copilot ScolaTech</h1>
        <p className="text-primary-300 text-sm mt-0.5">{schoolName} · assistant en lecture seule</p>
      </div>

      <CopilotChat ask={askCopilot} suggestions={SUGGESTED_PROMPTS} intro="Réponses en lecture seule, calculées à partir des données de votre école. Aucune modification n’est effectuée." placeholder="Ex. « Résumé de Awa Diop » ou « Situation financière »" />
    </div>
  )
}
