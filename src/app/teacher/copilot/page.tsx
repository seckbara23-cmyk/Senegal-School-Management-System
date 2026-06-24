import { requireTeacherCtx } from '../_auth'
import { CopilotChat } from '@/components/CopilotChat'
import { askTeacherCopilot } from './actions'

export const dynamic = 'force-dynamic'

const SUGGESTED = [
  'Résume mes classes',
  'Quels élèves sont en difficulté ?',
  'Quels devoirs ai-je donnés cette semaine ?',
  'Quelles présences dois-je saisir ?',
  'Quels commentaires de bulletin restent à préparer ?',
]

export default async function TeacherCopilotPage() {
  const { schoolName, teacher } = await requireTeacherCtx()

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/teacher" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Copilot Enseignant</h1>
        <p className="text-primary-300 text-sm mt-0.5">{teacher.first_name} · {schoolName} · assistant en lecture seule</p>
      </div>

      <CopilotChat
        ask={askTeacherCopilot}
        suggestions={SUGGESTED}
        intro="Réponses en lecture seule, limitées à vos classes et vos élèves. Aucune donnée financière ni d’autres enseignants."
        placeholder="Ex. « Quels élèves sont en difficulté ? »"
      />
    </div>
  )
}
