import { HelpGuide, Shot, type HelpSection } from '@/components/HelpGuide'

// Access restricted to active parents by the parent portal layout. Static, read-only guide.

const SECTIONS: HelpSection[] = [
  {
    id: 'intro',
    title: 'Introduction',
    body: (
      <>
        <p>Le <strong>portail parent</strong> est en <strong>consultation seule</strong>. Vous voyez uniquement les données de <strong>vos enfants liés</strong> à votre compte.</p>
        <p>Si « Aucun enfant lié » s&apos;affiche, contactez l&apos;administration de l&apos;école pour la liaison.</p>
        <Shot label="Tableau de bord parent" />
      </>
    ),
  },
  {
    id: 'dashboard',
    title: 'Tableau de bord',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/parent</code>.</p>
        <p>Une carte par enfant : taux de présence, solde dû et raccourcis (Bulletins, Examens, Présences, Finance). Annonces récentes en bas.</p>
      </>
    ),
  },
  {
    id: 'presences',
    title: 'Présences',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/parent/attendance</code>.</p>
        <p>Historique des séances et statuts (Présent, Absent, En retard, Excusé) pour l&apos;enfant sélectionné.</p>
      </>
    ),
  },
  {
    id: 'bulletins',
    title: 'Bulletins',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/parent/bulletins</code>.</p>
        <p>Moyennes et mentions par période et par classe. En cas d&apos;écart, contactez l&apos;enseignant via l&apos;établissement.</p>
        <Shot label="Bulletin (parent)" />
      </>
    ),
  },
  {
    id: 'examens',
    title: 'Examens (résultats)',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/parent/exams</code>.</p>
        <p>Résultats des sessions d&apos;examen <strong>publiées</strong> uniquement. Si les résultats ne sont pas visibles, la session n&apos;a pas encore été publiée par l&apos;école.</p>
      </>
    ),
  },
  {
    id: 'finance',
    title: 'Finance',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/parent/finance</code>.</p>
        <p>Factures et statut de paiement de vos enfants (consultation). Le paiement s&apos;effectue auprès de l&apos;école ; le portail affiche le solde.</p>
      </>
    ),
  },
  {
    id: 'emploi-du-temps',
    title: 'Emploi du temps',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/parent/timetable</code>.</p>
        <p>Emploi du temps de la classe de l&apos;enfant ; un export est disponible.</p>
      </>
    ),
  },
  {
    id: 'annonces',
    title: 'Annonces & notifications',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/parent/announcements</code> et la cloche de notifications (<code>/notifications</code>).</p>
        <p>Vous y recevez les annonces destinées aux parents et à l&apos;école, ainsi que les alertes (factures, paiements, présences, résultats).</p>
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
          <tr><td>Je ne vois pas mon enfant.</td><td>Demandez la liaison à l&apos;école.</td></tr>
          <tr><td>Pourquoi pas de résultats ?</td><td>Ils n&apos;apparaissent qu&apos;une fois publiés par l&apos;école.</td></tr>
          <tr><td>Comment payer une facture ?</td><td>Auprès de l&apos;école ; le portail affiche le solde.</td></tr>
          <tr><td>Puis-je modifier une note ?</td><td>Non : le portail parent est en lecture seule.</td></tr>
        </tbody>
      </table>
    ),
  },
]

export default function ParentHelpPage() {
  return (
    <HelpGuide
      badge="Aide · Parent"
      title="Guide du parent"
      intro="Suivre la scolarité de vos enfants : présences, bulletins, résultats et finances."
      sections={SECTIONS}
    />
  )
}
