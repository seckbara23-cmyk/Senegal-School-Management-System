import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { HelpGuide, type HelpSection } from '@/components/HelpGuide'

const SECTIONS: HelpSection[] = [
  {
    id: 'intro',
    title: 'Introduction',
    body: (
      <>
        <p>Le <strong>portail Super Administrateur</strong> gère la plateforme et tous les établissements : provisionnement, cycle de vie, abonnements et facturation SaaS, journaux d&apos;audit.</p>
        <p><strong>Accès :</strong> <code>/super-admin</code>.</p>
      </>
    ),
  },
  {
    id: 'ecoles',
    title: 'Écoles (établissements)',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/super-admin/schools</code>.</p>
        <ul>
          <li>« Nouvelle école » : crée l&apos;établissement + son premier administrateur (un abonnement « Starter » est provisionné automatiquement).</li>
          <li>Fiche école : modifier le profil, gérer les administrateurs, et le cycle de vie : <strong>Suspendre / Réactiver / Archiver</strong> (un dernier administrateur actif ne peut être retiré).</li>
        </ul>
        <p>Suspendre ou archiver met l&apos;établissement en <strong>lecture seule</strong> (accès), indépendamment de la facturation.</p>
      </>
    ),
  },
  {
    id: 'abonnements',
    title: 'Abonnements',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/super-admin/subscriptions</code>.</p>
        <p>Vue d&apos;ensemble par école (formule, statut de facturation, essai, période, usage vs limites). Fiche par école pour modifier formule/statut/dates ou annuler. <strong>Le statut de facturation ne modifie jamais l&apos;accès de l&apos;école.</strong></p>
      </>
    ),
  },
  {
    id: 'facturation',
    title: 'Facturation SaaS',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/super-admin/subscriptions/invoices</code> et la fiche d&apos;abonnement d&apos;une école.</p>
        <p>Créez des factures d&apos;abonnement par école et enregistrez des paiements manuels (manuel, Wave, Orange Money, carte, virement). Une facture passe à « Réglée » lorsqu&apos;elle est entièrement payée.</p>
      </>
    ),
  },
  {
    id: 'audit',
    title: 'Journaux d\'audit & tâches',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/super-admin/audit-logs</code> (historique filtrable de toutes les actions) et <code>/super-admin/jobs/overdue-invoices</code> (relance des factures en retard).</p>
      </>
    ),
  },
]

export default async function SuperAdminHelpPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('global_role').eq('id', user.id).maybeSingle()
  if ((profile as { global_role: string } | null)?.global_role !== 'super_admin') redirect('/dashboard')

  return (
    <HelpGuide
      badge="Aide · Super Admin"
      title="Guide du super administrateur"
      intro="Gérer les établissements, les abonnements, la facturation SaaS et l'audit."
      sections={SECTIONS}
    />
  )
}
