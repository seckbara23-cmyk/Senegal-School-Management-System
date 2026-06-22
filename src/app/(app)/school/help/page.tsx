import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { HelpGuide, Shot, type HelpSection } from '@/components/HelpGuide'

const SECTIONS: HelpSection[] = [
  {
    id: 'intro',
    title: 'Introduction',
    body: (
      <>
        <p>Ce guide intégré accompagne l&apos;<strong>administrateur scolaire</strong>. Vous gérez un seul établissement : vos données ne sont jamais visibles par une autre école.</p>
        <p>Depuis le tableau de bord <code>/school</code>, la section « Modules de gestion » donne accès à tous les modules. Le fil d&apos;Ariane permet de revenir en arrière.</p>
        <Shot label="Tableau de bord" />
      </>
    ),
  },
  {
    id: 'ordre',
    title: 'Carte des étapes (ordre de configuration)',
    body: (
      <>
        <p>Respectez cet ordre : chaque étape dépend de la précédente.</p>
        <ol>
          <li>Année scolaire — <code>/school/academic-years</code> (créer puis <strong>activer</strong>)</li>
          <li>Classes — <code>/school/classes</code></li>
          <li>Matières — <code>/school/academics/subjects</code></li>
          <li>Enseignants — <code>/school/teachers</code></li>
          <li>Affectations — <code>/school/academics/assignments</code></li>
          <li>Élèves — <code>/school/students</code></li>
          <li>Parents — <code>/school/parents</code></li>
          <li>Comptes utilisateurs — <code>/school/users</code></li>
          <li>Frais — <code>/school/finance/fees</code></li>
        </ol>
        <p><strong>Règle d&apos;or :</strong> sans année active, les classes ne se créent pas ; sans affectation, un enseignant ne peut ni noter ni faire l&apos;appel.</p>
      </>
    ),
  },
  {
    id: 'checklist-rentree',
    title: 'Checklist de rentrée',
    body: (
      <ul>
        <li>☐ Année scolaire créée et <strong>activée</strong></li>
        <li>☐ Classes créées</li>
        <li>☐ Matières créées et rattachées aux classes</li>
        <li>☐ Enseignants créés et <strong>affectés</strong></li>
        <li>☐ Élèves enregistrés et inscrits en classe</li>
        <li>☐ Parents enregistrés et liés</li>
        <li>☐ Comptes utilisateurs créés</li>
        <li>☐ Frais de scolarité configurés</li>
        <li>☐ Emploi du temps saisi · Périodes académiques créées</li>
      </ul>
    ),
  },
  {
    id: 'dashboard',
    title: 'Tableau de bord',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/school</code>.</p>
        <p>Indicateurs (élèves, enseignants, parents, classes, présences du jour, assiduité 30 j, impayés, factures en retard, année) et panneaux d&apos;activité (évaluations à venir, factures en retard, annonces, paiements et absences récents, dernière session d&apos;examen). Chaque carte est cliquable.</p>
        <p>💡 Vérifiez chaque matin les impayés et absences ; contrôlez la mention « Année active ».</p>
      </>
    ),
  },
  {
    id: 'eleves',
    title: 'Élèves',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/school/students</code>.</p>
        <h3>Étapes</h3>
        <ol>
          <li>« Ajouter un élève » → prénom, nom, <strong>numéro d&apos;admission (unique)</strong>, sexe, date de naissance, statut → enregistrer.</li>
          <li>Rechercher par nom/matricule ; ouvrir la fiche via « Voir → ».</li>
          <li>Fiche : identité, scolarité, <strong>finance</strong> et <strong>progression</strong> de l&apos;élève, <strong>documents</strong>.</li>
        </ol>
        <p><strong>Statuts :</strong> Actif (compté dans les effectifs), Inactif, Diplômé. Changez le statut plutôt que de supprimer.</p>
        <Shot label="Liste des élèves" />
      </>
    ),
  },
  {
    id: 'enseignants',
    title: 'Enseignants',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/school/teachers</code>.</p>
        <ol>
          <li>« + Nouvel enseignant » → prénom, nom, matricule, téléphone, email.</li>
          <li>Fiche → « Gérer les affectations » → associez un couple <strong>classe + matière</strong> (un seul enseignant par classe-matière).</li>
          <li>Activez/désactivez le dossier ; liez un compte portail pour la saisie des notes/présences.</li>
        </ol>
        <Shot label="Affectations de l'enseignant" />
      </>
    ),
  },
  {
    id: 'parents',
    title: 'Parents',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/school/parents</code>.</p>
        <ol>
          <li>« Nouveau dossier » → identité, téléphone, email, profession, adresse.</li>
          <li>« Lier un élève » → choisir l&apos;élève et le type de lien (Père, Mère, Tuteur, Autre) ; définir un contact principal.</li>
          <li>« Retirer » pour supprimer un lien.</li>
        </ol>
      </>
    ),
  },
  {
    id: 'classes',
    title: 'Classes',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/school/classes</code>.</p>
        <ol>
          <li>« Ajouter une classe » → nom, niveau, section, année.</li>
          <li>Fiche classe → « Ajouter des élèves » pour inscrire ; « Retirer » pour désinscrire.</li>
        </ol>
        <p>💡 Pour <strong>déplacer</strong> un élève : retirez-le de l&apos;ancienne classe puis inscrivez-le dans la nouvelle.</p>
      </>
    ),
  },
  {
    id: 'annees',
    title: 'Années scolaires',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/school/academic-years</code>.</p>
        <p>Créez l&apos;année (nom, début, fin) puis <strong>activez-la</strong>. Une seule année active à la fois ; classes, périodes, notes, bulletins et indicateurs en dépendent.</p>
      </>
    ),
  },
  {
    id: 'academique',
    title: 'Académique (matières, notes, bulletins, classement)',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/school/academics</code>.</p>
        <ul>
          <li><strong>Matières</strong> (<code>/subjects</code>) : nom, code, coefficient.</li>
          <li><strong>Affectations</strong> (<code>/assignments</code>) : matière↔classe, enseignant↔classe-matière.</li>
          <li><strong>Périodes</strong> (<code>/periods</code>) : trimestres/semestres.</li>
          <li><strong>Évaluations</strong> (<code>/assessments</code>) : type, barème, coefficient, date ; saisie des notes sur la fiche de l&apos;évaluation. Pour corriger une note, rouvrez l&apos;évaluation et ré-enregistrez.</li>
          <li><strong>Bulletins</strong> (<code>/bulletins</code>) et <strong>Classement</strong> (<code>/rankings</code>) : sélectionnez période + classe.</li>
        </ul>
        <Shot label="Saisie des notes" />
      </>
    ),
  },
  {
    id: 'presences',
    title: 'Présences',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/school/attendance</code>.</p>
        <ol>
          <li>« Nouvelle séance » → classe + date → « Charger la liste ».</li>
          <li>Statut par élève : <strong>Présent, Absent, En retard, Excusé</strong> (« Marquer tout » disponible).</li>
          <li>« Enregistrer la séance ».</li>
        </ol>
        <p>Une seule séance par classe et par date. Les absences/retards notifient les familles.</p>
      </>
    ),
  },
  {
    id: 'examens',
    title: 'Examens',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/school/exams</code>.</p>
        <p>Cycle : <strong>Brouillon → Active → Terminée → Archivée</strong>. Rattachez les évaluations à la session, puis sur la page « Résultats » publiez « classe par classe » ou « toute la session ».</p>
        <p>⚠️ La publication exige une session <strong>Terminée</strong> et <strong>100 %</strong> des notes saisies.</p>
        <Shot label="Résultats d'examen" />
      </>
    ),
  },
  {
    id: 'emploi-du-temps',
    title: 'Emploi du temps',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/school/timetable</code>.</p>
        <ol>
          <li>Sélectionnez année + classe → « Afficher ».</li>
          <li>« + Nouveau créneau » → jour, horaires, classe-matière, enseignant, salle.</li>
        </ol>
        <p>Les conflits d&apos;horaires sont détectés et bloqués. Vue imprimable + export CSV.</p>
      </>
    ),
  },
  {
    id: 'finance',
    title: 'Finance (frais de scolarité)',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/school/finance</code>.</p>
        <ul>
          <li><strong>Frais</strong> (<code>/fees</code>) : libellé, montant.</li>
          <li><strong>Factures</strong> : « + Nouvelle facture » (individuelle) ou « Facturation par classe » (groupée).</li>
          <li><strong>Paiements</strong> : ouvrez la facture → « Enregistrer un paiement » (mode + référence) ; un trop-perçu est refusé ; un reçu est généré.</li>
          <li><strong>Annulation</strong> de facture avec motif.</li>
          <li><strong>Rapport</strong> (<code>/reports</code>) + export CSV.</li>
        </ul>
        <p><strong>Statuts facture :</strong> Impayée, Partielle, Réglée, Annulée.</p>
        <Shot label="Détail d'une facture" />
      </>
    ),
  },
  {
    id: 'admissions',
    title: 'Admissions',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/school/admissions</code>.</p>
        <p>Statuts : Brouillon, Soumise, Acceptée, Refusée, Liste d&apos;attente. Sur une candidature <strong>Acceptée</strong> → « Convertir en élève » (matricule + classe optionnelle). La candidature est ensuite figée.</p>
      </>
    ),
  },
  {
    id: 'documents',
    title: 'Documents',
    body: (
      <>
        <p>Section « Documents » en bas des fiches élève, enseignant et candidature.</p>
        <p>Formats : <strong>PDF, PNG, JPG, WEBP</strong> ; taille max <strong>10 Mo</strong>. Consultation via lien sécurisé temporaire ; suppression possible.</p>
      </>
    ),
  },
  {
    id: 'annonces',
    title: 'Annonces',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/school/announcements</code>.</p>
        <p>« Nouvelle annonce » → titre, message, <strong>audience</strong> (Toute l&apos;école, Parents, Élèves, Personnel, ou une Classe) → « Publier ».</p>
      </>
    ),
  },
  {
    id: 'comptes',
    title: 'Comptes utilisateurs',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/school/users</code>.</p>
        <ul>
          <li>« + Nouveau compte » → email, nom, <strong>rôle</strong> (Administrateur, Enseignant, Agent financier, Parent, Élève), mot de passe temporaire ; liaison à un dossier possible.</li>
          <li>Lier/délier un dossier ; activer/désactiver ; « Générer un lien de réinitialisation ».</li>
        </ul>
        <p>⚠️ Attribuez le rôle Administrateur avec parcimonie. Liez chaque enseignant/parent/élève à son dossier pour activer son portail.</p>
      </>
    ),
  },
  {
    id: 'abonnement',
    title: 'Abonnement ScolaTech',
    body: (
      <>
        <p><strong>Accès :</strong> <code>/school/billing</code> (lecture seule).</p>
        <p>Factures et paiements de l&apos;abonnement de votre établissement <strong>auprès d&apos;ScolaTech</strong>. À ne pas confondre avec les frais de scolarité payés par les familles (module Finance).</p>
      </>
    ),
  },
  {
    id: 'analyses',
    title: 'Analyses & rapports',
    body: (
      <>
        <p>ScolaTech n&apos;a pas de module « Analytics » séparé. Les analyses se trouvent dans :</p>
        <ul>
          <li>Tableau de bord (KPI) — <code>/school</code></li>
          <li>Rapport financier — <code>/school/finance/reports</code></li>
          <li>Classement académique — <code>/school/academics/rankings</code></li>
          <li>Progression élève — <code>/school/students/[id]/progress</code></li>
          <li>Résultats d&apos;examen — <code>/school/exams/[session]/results</code></li>
        </ul>
      </>
    ),
  },
  {
    id: 'checklist-periode',
    title: 'Checklist de fin de période',
    body: (
      <ul>
        <li>☐ Toutes les notes saisies</li>
        <li>☐ Évaluations vérifiées · Classements calculés</li>
        <li>☐ Bulletins générés et vérifiés</li>
        <li>☐ Session d&apos;examen « Terminée » · Résultats publiés</li>
        <li>☐ Rapport financier exporté · Impayés relancés</li>
      </ul>
    ),
  },
  {
    id: 'glossaire',
    title: 'Glossaire',
    body: (
      <ul>
        <li><strong>Année active</strong> : année en cours sur laquelle s&apos;appuient classes, notes et bulletins (une seule à la fois).</li>
        <li><strong>Affectation</strong> : lien enseignant ↔ classe-matière autorisant la saisie des notes/présences.</li>
        <li><strong>Classe-matière</strong> : une matière enseignée dans une classe pour une année.</li>
        <li><strong>Évaluation</strong> : contrôle noté (type, barème, coefficient).</li>
        <li><strong>Bulletin</strong> : relevé des moyennes et mentions par période.</li>
        <li><strong>Session d&apos;examen</strong> : regroupement d&apos;évaluations dont les résultats peuvent être publiés.</li>
        <li><strong>Facturation groupée</strong> : une facture pour tous les élèves d&apos;une classe en une opération.</li>
        <li><strong>Mode lecture seule</strong> : établissement suspendu/archivé — consultation possible, modifications désactivées.</li>
      </ul>
    ),
  },
  {
    id: 'depannage',
    title: 'Dépannage rapide',
    body: (
      <table>
        <thead>
          <tr><th>Problème</th><th>Solution</th></tr>
        </thead>
        <tbody>
          <tr><td>Modules vides</td><td>Activez une année scolaire.</td></tr>
          <tr><td>« Matricule déjà utilisé »</td><td>Choisissez un numéro d&apos;admission unique.</td></tr>
          <tr><td>« Limite atteinte » (élèves/enseignants)</td><td>Plafond de la formule ; contactez ScolaTech.</td></tr>
          <tr><td>« Séance déjà existante »</td><td>Une seule séance par classe/date ; ouvrez l&apos;existante.</td></tr>
          <tr><td>Publication d&apos;examen bloquée</td><td>Session « Terminée » + 100 % des notes.</td></tr>
          <tr><td>Paiement refusé</td><td>Le montant dépasse le solde restant.</td></tr>
          <tr><td>Modifications désactivées</td><td>Établissement en lecture seule (suspendu/archivé).</td></tr>
        </tbody>
      </table>
    ),
  },
]

export default async function SchoolHelpPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) redirect('/dashboard')

  return (
    <HelpGuide
      badge="Aide · Administrateur"
      title="Guide de l'administrateur scolaire"
      intro="Référence rapide intégrée : configuration, modules et opérations courantes."
      sections={SECTIONS}
    />
  )
}
