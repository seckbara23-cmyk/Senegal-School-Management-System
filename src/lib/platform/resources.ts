// ─── Pilot training resources catalogue (static, super-admin) ────────────────
//
// Curated onboarding/enablement guidance for pilot schools. Each resource maps to
// a setup-step key (so the onboarding workspace can recommend exactly what an
// incomplete school needs next) and a theme. Pure data — no schema, no fetch.
// `href` points at the in-product destination the school admin would use.

import type { SetupStepKey } from '@/lib/setup'

export type ResourceTheme = 'onboarding' | 'academics' | 'finance' | 'communication' | 'engagement' | 'admin'

export type PilotResource = {
  key: string
  title: string
  desc: string
  theme: ResourceTheme
  href: string
  format: 'guide' | 'checklist' | 'video' | 'reference'
  step?: SetupStepKey   // links the resource to an onboarding step
}

export const THEME_LABEL: Record<ResourceTheme, string> = {
  onboarding: 'Démarrage', academics: 'Pédagogie', finance: 'Finances', communication: 'Communication', engagement: 'Engagement', admin: 'Administration',
}

export const PILOT_RESOURCES: PilotResource[] = [
  // Onboarding
  { key: 'setup_wizard', title: 'Assistant de configuration', desc: 'Parcours guidé de première configuration, étape par étape.', theme: 'onboarding', href: '/school/setup', format: 'checklist', step: 'profile' },
  { key: 'profile', title: 'Compléter le profil de l’école', desc: 'Coordonnées, logo et informations affichées aux familles.', theme: 'onboarding', href: '/school/settings', format: 'guide', step: 'profile' },
  { key: 'academic_year', title: 'Créer l’année scolaire', desc: 'Définir et activer l’année en cours avant toute saisie.', theme: 'onboarding', href: '/school/academic-years', format: 'guide', step: 'academic_year' },
  { key: 'classes', title: 'Structurer classes & niveaux', desc: 'Organiser les classes, niveaux et effectifs.', theme: 'onboarding', href: '/school/classes', format: 'guide', step: 'classes' },
  { key: 'subjects', title: 'Définir les matières', desc: 'Catalogue des matières enseignées dans l’établissement.', theme: 'academics', href: '/school/academics/subjects', format: 'guide', step: 'subjects' },
  { key: 'teachers', title: 'Ajouter les enseignants', desc: 'Constituer le corps enseignant et créer les comptes.', theme: 'onboarding', href: '/school/teachers', format: 'guide', step: 'teachers' },
  { key: 'students', title: 'Inscrire les élèves', desc: 'Saisie individuelle ou import en masse des élèves.', theme: 'onboarding', href: '/school/students', format: 'guide', step: 'students' },
  { key: 'assignments', title: 'Affecter matières & enseignants', desc: 'Associer matières et enseignants à chaque classe.', theme: 'academics', href: '/school/classes', format: 'guide', step: 'assignments' },
  { key: 'parents', title: 'Connecter les parents', desc: 'Inviter les parents et lier les comptes aux élèves.', theme: 'engagement', href: '/school/parents', format: 'guide', step: 'parents' },
  // Daily use / value drivers
  { key: 'attendance', title: 'Prise de présence quotidienne', desc: 'Routine enseignant : marquer les présences en classe.', theme: 'academics', href: '/school/attendance', format: 'checklist' },
  { key: 'grades', title: 'Saisir les évaluations', desc: 'Notes, barèmes et publication des résultats.', theme: 'academics', href: '/school/academics', format: 'guide' },
  { key: 'bulletins', title: 'Générer les bulletins', desc: 'Bulletins et appréciations en fin de période.', theme: 'academics', href: '/school/academics', format: 'guide' },
  { key: 'invoicing', title: 'Facturation des frais', desc: 'Créer factures et échéanciers, suivre le recouvrement.', theme: 'finance', href: '/school/finance', format: 'guide' },
  { key: 'online_pay', title: 'Activer les paiements en ligne', desc: 'Wave / Orange Money pour encaisser plus vite.', theme: 'finance', href: '/school/finance', format: 'guide' },
  { key: 'communication', title: 'Configurer la communication', desc: 'E-mail, SMS, WhatsApp en plus des notifications in-app.', theme: 'communication', href: '/school/communications', format: 'guide' },
  { key: 'broadcast', title: 'Diffuser une annonce', desc: 'Toucher parents et enseignants selon leurs préférences.', theme: 'communication', href: '/school/communications/broadcast', format: 'guide' },
  { key: 'admissions', title: 'Ouvrir les candidatures en ligne', desc: 'Page publique de candidature et suivi du pipeline.', theme: 'engagement', href: '/school/admissions/settings', format: 'guide', step: 'admissions' },
  { key: 'transport', title: 'Mettre en place le transport', desc: 'Véhicules, itinéraires et frais de transport.', theme: 'admin', href: '/school/transport', format: 'guide', step: 'transport' },
]

export function resourcesForStep(step: SetupStepKey): PilotResource[] {
  return PILOT_RESOURCES.filter((r) => r.step === step)
}
