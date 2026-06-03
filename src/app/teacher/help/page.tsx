import { HelpGuide, Shot, type HelpSection } from '@/components/HelpGuide'

// Access to this route is already restricted to active teachers by the teacher
// portal layout (requireTeacher pattern). Static content only.

const SECTIONS: HelpSection[] = [
  {
    id: 'intro',
    title: 'Introduction',
    body: (
      <>
        <p>Bienvenue sur le <strong>portail enseignant</strong>. Vous travaillez uniquement sur vos <strong>classes-matières assignées</strong> par l&apos;administration.</p>
        <p>Vous pouvez saisir notes et présences, consulter votre emploi du temps et les annonces. Vous n&apos;avez pas accès à la finance, aux comptes ni à l&apos;administration.</p>
        <Shot label="Tableau de bord enseignant" />
      </>
    ),
  },
  {
    id: 'dashboard',
    title: 'Tableau de bord',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/teacher</code>.</p>
        <p>Vue d&apos;ensemble : vos matières assignées, vos évaluations récentes et les annonces. Si « Aucune matière assignée » s&apos;affiche, demandez vos affectations à l&apos;administration.</p>
      </>
    ),
  },
  {
    id: 'classes',
    title: 'Mes classes',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/teacher/classes</code>.</p>
        <p>Liste de vos classes-matières. Sélectionnez-en une pour accéder aux notes et présences correspondantes.</p>
      </>
    ),
  },
  {
    id: 'presences',
    title: 'Présences (avec mode hors-ligne)',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/teacher/attendance</code> → « Nouvelle séance ».</p>
        <ol>
          <li>Choisissez la classe et la date → « Charger la liste ».</li>
          <li>Marquez chaque élève : <strong>Présent, Absent, En retard, Excusé</strong> (« Marquer tout » disponible).</li>
          <li>« Enregistrer la séance ».</li>
        </ol>
        <p><strong>Mode hors-ligne :</strong> si la connexion est perdue pendant la saisie, votre brouillon est conservé sur l&apos;appareil (« Hors ligne »). Au retour de la connexion, cliquez sur <strong>« Synchroniser maintenant »</strong>.</p>
        <Shot label="Saisie des présences (enseignant)" />
      </>
    ),
  },
  {
    id: 'evaluations',
    title: 'Évaluations',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/teacher/grades</code> → « + Nouvelle évaluation ».</p>
        <p>Créez une évaluation pour une de vos classes-matières : type, barème, coefficient, date, période. Vous ne pouvez créer une évaluation que pour une classe-matière qui vous est affectée.</p>
      </>
    ),
  },
  {
    id: 'notes',
    title: 'Notes',
    body: (
      <>
        <p><strong>Accès :</strong> ouvrez une évaluation depuis <code>/teacher/grades</code>.</p>
        <ol>
          <li>Saisissez la note de chaque élève (≤ barème).</li>
          <li>« Enregistrer les notes ».</li>
          <li>Pour <strong>corriger</strong> : modifiez la valeur et ré-enregistrez.</li>
        </ol>
        <p>💡 Complétez 100 % des notes avant la clôture d&apos;une session d&apos;examen.</p>
        <Shot label="Saisie des notes (enseignant)" />
      </>
    ),
  },
  {
    id: 'emploi-du-temps',
    title: 'Emploi du temps',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/teacher/timetable</code>.</p>
        <p>Consultez vos créneaux ; un export est disponible.</p>
      </>
    ),
  },
  {
    id: 'annonces',
    title: 'Annonces & notifications',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/teacher/announcements</code> et la cloche de notifications (<code>/notifications</code>).</p>
        <p>Consultez régulièrement les annonces destinées au personnel et à l&apos;école.</p>
      </>
    ),
  },
  {
    id: 'depannage',
    title: 'Questions fréquentes',
    body: (
      <table>
        <thead><tr><th>Question</th><th>Réponse</th></tr></thead>
        <tbody>
          <tr><td>Je ne vois pas une classe.</td><td>Demandez l&apos;affectation à l&apos;administration.</td></tr>
          <tr><td>Comment corriger une note ?</td><td>Rouvrez l&apos;évaluation, modifiez, ré-enregistrez.</td></tr>
          <tr><td>J&apos;ai perdu la connexion pendant l&apos;appel.</td><td>Le brouillon est conservé ; « Synchroniser maintenant » au retour.</td></tr>
          <tr><td>« Séance déjà existante »</td><td>Une seule séance par classe et par date.</td></tr>
          <tr><td>Je ne peux rien enregistrer.</td><td>L&apos;établissement est peut-être en lecture seule ; contactez l&apos;administration.</td></tr>
        </tbody>
      </table>
    ),
  },
]

export default function TeacherHelpPage() {
  return (
    <HelpGuide
      badge="Aide · Enseignant"
      title="Guide de l'enseignant"
      intro="Saisir notes et présences, consulter votre emploi du temps et les annonces."
      sections={SECTIONS}
    />
  )
}
