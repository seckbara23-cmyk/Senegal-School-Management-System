import { requireParentCtx } from '../_auth'
import { CopilotChat } from '@/components/CopilotChat'
import { askParentCopilot } from './actions'

export const dynamic = 'force-dynamic'

const SUGGESTED = [
  'Comment va mon enfant ?',
  'Résume la semaine de mon enfant',
  'Quels devoirs restent à faire ?',
  'Y a-t-il des paiements en retard ?',
  'Quelle est la situation du transport ?',
  'Quels messages dois-je lire ?',
]

export default async function ParentCopilotPage() {
  const { schoolName, parent } = await requireParentCtx()

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/parent" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Copilot Parent</h1>
        <p className="text-primary-300 text-sm mt-0.5">Bonjour {parent.first_name} · {schoolName} · assistant en lecture seule</p>
      </div>

      <CopilotChat
        ask={askParentCopilot}
        suggestions={SUGGESTED}
        intro="Réponses en lecture seule, limitées à vos enfants. Aucune autre famille, aucune donnée de l’école."
        placeholder="Ex. « Comment va mon enfant ? »"
      />
    </div>
  )
}
