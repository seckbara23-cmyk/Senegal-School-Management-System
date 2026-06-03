import { HelpGuide, Shot, type HelpSection } from '@/components/HelpGuide'

// Access restricted to active students by the student portal layout. Static, read-only guide.

const SECTIONS: HelpSection[] = [
  {
    id: 'intro',
    title: 'Introduction',
    body: (
      <>
        <p>Le <strong>portail élève</strong> te permet de suivre <strong>ta propre</strong> scolarité. Il est en <strong>consultation seule</strong>.</p>
        <Shot label="Tableau de bord élève" />
      </>
    ),
  },
  {
    id: 'dashboard',
    title: 'Tableau de bord',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/student</code>.</p>
        <p>Taux de présence, nombre d&apos;absences, solde dû, présences récentes et annonces.</p>
      </>
    ),
  },
  {
    id: 'presences',
    title: 'Présences',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/student/attendance</code>.</p>
        <p>Historique de tes statuts : Présent, Absent, En retard, Excusé.</p>
      </>
    ),
  },
  {
    id: 'bulletins',
    title: 'Bulletins',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/student/bulletins</code>.</p>
        <p>Tes moyennes et mentions par période.</p>
      </>
    ),
  },
  {
    id: 'resultats',
    title: 'Résultats d\'examen',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/student/exams</code>.</p>
        <p>Résultats des sessions <strong>publiées</strong> uniquement. S&apos;ils n&apos;apparaissent pas, la session n&apos;a pas encore été publiée.</p>
        <Shot label="Résultats (élève)" />
      </>
    ),
  },
  {
    id: 'emploi-du-temps',
    title: 'Emploi du temps',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/student/timetable</code>.</p>
        <p>Ton emploi du temps ; un export est disponible.</p>
      </>
    ),
  },
  {
    id: 'finance',
    title: 'Finance',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/student/finance</code>.</p>
        <p>Tes factures et leur statut de paiement (consultation).</p>
      </>
    ),
  },
  {
    id: 'annonces',
    title: 'Annonces & notifications',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/student/announcements</code> et la cloche de notifications (<code>/notifications</code>).</p>
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
          <tr><td>Je ne vois pas mes résultats.</td><td>Ils apparaissent une fois publiés par l&apos;école.</td></tr>
          <tr><td>Une note semble fausse.</td><td>Signale-le à ton enseignant via l&apos;école.</td></tr>
          <tr><td>Puis-je modifier mes données ?</td><td>Non : le portail élève est en lecture seule.</td></tr>
        </tbody>
      </table>
    ),
  },
]

export default function StudentHelpPage() {
  return (
    <HelpGuide
      badge="Aide · Élève"
      title="Guide de l'élève"
      intro="Consulter tes présences, bulletins, résultats, emploi du temps et finances."
      sections={SECTIONS}
    />
  )
}
