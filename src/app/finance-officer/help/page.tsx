import { HelpGuide, Shot, type HelpSection } from '@/components/HelpGuide'

// Access restricted to active finance officers by the finance-officer portal
// layout (requireFinanceOfficerCtx). Static content only.

const SECTIONS: HelpSection[] = [
  {
    id: 'intro',
    title: 'Introduction',
    body: (
      <>
        <p>Le <strong>portail de l&apos;agent financier</strong> est dédié à la finance de l&apos;établissement : factures, paiements et rapports. Vous n&apos;avez pas accès à l&apos;académique, aux présences, aux comptes ni à l&apos;administration.</p>
        <Shot label="Tableau de bord agent financier" />
      </>
    ),
  },
  {
    id: 'dashboard',
    title: 'Tableau de bord',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/finance-officer</code>.</p>
        <p>Synthèse : montants facturés, encaissés, en attente, factures en retard, factures et paiements récents.</p>
      </>
    ),
  },
  {
    id: 'factures',
    title: 'Factures',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/finance-officer/invoices</code>.</p>
        <p>Consultez toutes les factures des élèves de l&apos;établissement et ouvrez le détail d&apos;une facture pour enregistrer un paiement.</p>
      </>
    ),
  },
  {
    id: 'paiements',
    title: 'Paiements',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/finance-officer/payments</code>.</p>
        <ol>
          <li>Ouvrez la facture concernée → « Enregistrer un paiement ».</li>
          <li>Saisissez le montant (≤ solde restant), le mode (Espèces, Virement, Chèque, Wave, Orange Money…) et une référence.</li>
          <li>Un <strong>reçu</strong> est généré ; un trop-perçu est refusé.</li>
        </ol>
        <Shot label="Reçu de paiement" />
      </>
    ),
  },
  {
    id: 'rapports',
    title: 'Rapports',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/finance-officer/reports</code>.</p>
        <p>Rapport financier sur une plage de dates ; export possible.</p>
      </>
    ),
  },
  {
    id: 'faq',
    title: 'Questions fréquentes',
    body: (
      <table>
        <thead><tr><th>Question</th><th>Réponse</th></tr></thead>
        <tbody>
          <tr><td>Paiement refusé</td><td>Le montant dépasse le solde restant.</td></tr>
          <tr><td>Facture déjà réglée / annulée</td><td>Aucun paiement possible ; vérifiez le statut.</td></tr>
          <tr><td>Je ne peux rien enregistrer</td><td>L&apos;établissement est peut-être en lecture seule.</td></tr>
        </tbody>
      </table>
    ),
  },
]

export default function FinanceOfficerHelpPage() {
  return (
    <HelpGuide
      badge="Aide · Agent financier"
      title="Guide de l'agent financier"
      intro="Enregistrer les paiements, suivre les factures et consulter les rapports."
      sections={SECTIONS}
    />
  )
}
