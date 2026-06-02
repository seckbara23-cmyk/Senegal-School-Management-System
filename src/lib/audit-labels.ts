// ─── Audit label & option catalogue ─────────────────────────────────────────
//
// Central, French-language catalogue of the audit actions and resource types
// the application actually writes (see the logAuditEvent call sites). Kept here
// so the super-admin audit-log viewer's filter dropdowns and row labels stay in
// sync with what is logged. When a new audited action is added, add it here too.

// ── Action → human label ─────────────────────────────────────────────────────

export const ACTION_LABELS: Record<string, string> = {
  // Finance
  fee_item_created:              'Frais créé',
  invoice_created:               'Facture créée',
  payment_recorded:             'Paiement enregistré',
  bulk_invoices_created:         'Facturation groupée',
  invoice_cancelled:             'Facture annulée',
  // Classes / inscriptions
  class_created:                 'Classe créée',
  students_enrolled:             'Élèves inscrits',
  enrollment_withdrawn:          'Inscription retirée',
  // Années scolaires
  academic_year_created:         'Année scolaire créée',
  academic_year_updated:         'Année scolaire modifiée',
  academic_year_status_changed:  'Statut année modifié',
  // Structure académique
  subject_created:               'Matière créée',
  subject_assigned_to_class:     'Matière assignée à une classe',
  subject_removed_from_class:    'Matière retirée d’une classe',
  teacher_assigned_to_subject:   'Enseignant assigné à une matière',
  academic_period_created:       'Période créée',
  assessment_created:            'Évaluation créée',
  grades_saved:                  'Notes enregistrées',
  // Emploi du temps
  timetable_slot_created:        'Créneau ajouté',
  timetable_slot_updated:        'Créneau modifié',
  timetable_slot_deleted:        'Créneau supprimé',
  // Sessions d'examen
  exam_session_created:          'Session d’examen créée',
  exam_session_updated:          'Session d’examen modifiée',
  exam_session_activated:        'Session d’examen activée',
  exam_session_completed:        'Session d’examen terminée',
  exam_session_archived:         'Session d’examen archivée',
  // Annonces
  announcement_published:        'Annonce publiée',
  // Personnes
  student_created:               'Élève créé',
  student_updated:               'Élève modifié',
  teacher_created:               'Enseignant créé',
  teacher_updated:               'Enseignant modifié',
  teacher_status_changed:        'Statut enseignant modifié',
  parent_created:                'Parent créé',
  parent_updated:                'Parent modifié',
  parent_status_changed:         'Statut parent modifié',
  parent_student_linked:         'Parent lié à un élève',
  parent_student_unlinked:       'Parent délié d’un élève',
  // Présences (administration)
  admin_attendance_session_created: 'Séance de présence créée (admin)',
  admin_attendance_records_saved:   'Présences enregistrées (admin)',
  // Portail enseignant
  teacher_attendance_session_created: 'Séance de présence créée',
  teacher_attendance_records_saved:   'Présences enregistrées',
  teacher_assessment_created:    'Évaluation créée (enseignant)',
  teacher_grades_saved:          'Notes enregistrées (enseignant)',
  // Comptes & rôles
  user_created:                  'Compte créé',
  role_linked:                   'Rôle lié',
  role_unlinked:                 'Rôle délié',
  user_deactivated:              'Compte désactivé',
  user_reactivated:              'Compte réactivé',
  password_reset_link_generated: 'Lien de réinitialisation généré',
  // Plateforme
  school_created:                'École créée',
  school_updated:                'École modifiée',
  school_subscription_updated:   'Abonnement modifié',
  school_admin_created:          'Administrateur d’école créé',
  school_suspended:              'École suspendue',
  school_reactivated:            'École réactivée',
  school_archived:               'École archivée',
  school_admin_added:            'Administrateur ajouté',
  school_admin_removed:          'Administrateur retiré',
  school_admin_deactivated:      'Administrateur désactivé',
  school_admin_reactivated:      'Administrateur réactivé',
  school_admin_password_reset_generated: 'Lien de réinitialisation (admin école)',
}

// ── Grouped action options for the filter <select> ───────────────────────────

export const ACTION_GROUPS: { label: string; actions: string[] }[] = [
  { label: 'Finance',              actions: ['fee_item_created', 'invoice_created', 'payment_recorded', 'bulk_invoices_created', 'invoice_cancelled'] },
  { label: 'Classes & inscriptions', actions: ['class_created', 'students_enrolled', 'enrollment_withdrawn'] },
  { label: 'Années scolaires',     actions: ['academic_year_created', 'academic_year_updated', 'academic_year_status_changed'] },
  { label: 'Structure académique', actions: ['subject_created', 'subject_assigned_to_class', 'subject_removed_from_class', 'teacher_assigned_to_subject', 'academic_period_created', 'assessment_created', 'grades_saved'] },
  { label: 'Emploi du temps',      actions: ['timetable_slot_created', 'timetable_slot_updated', 'timetable_slot_deleted'] },
  { label: 'Sessions d’examen',    actions: ['exam_session_created', 'exam_session_updated', 'exam_session_activated', 'exam_session_completed', 'exam_session_archived'] },
  { label: 'Annonces',             actions: ['announcement_published'] },
  { label: 'Personnes',            actions: ['student_created', 'student_updated', 'teacher_created', 'teacher_updated', 'teacher_status_changed', 'parent_created', 'parent_updated', 'parent_status_changed', 'parent_student_linked', 'parent_student_unlinked'] },
  { label: 'Présences (admin)',    actions: ['admin_attendance_session_created', 'admin_attendance_records_saved'] },
  { label: 'Portail enseignant',   actions: ['teacher_attendance_session_created', 'teacher_attendance_records_saved', 'teacher_assessment_created', 'teacher_grades_saved'] },
  { label: 'Comptes & rôles',      actions: ['user_created', 'role_linked', 'role_unlinked', 'user_deactivated', 'user_reactivated', 'password_reset_link_generated'] },
  { label: 'Plateforme',           actions: ['school_created', 'school_updated', 'school_subscription_updated', 'school_admin_created'] },
  { label: 'Cycle de vie tenant',  actions: ['school_suspended', 'school_reactivated', 'school_archived'] },
  { label: 'Admins d’école',       actions: ['school_admin_added', 'school_admin_removed', 'school_admin_deactivated', 'school_admin_reactivated', 'school_admin_password_reset_generated'] },
]

// ── Resource type → human label ──────────────────────────────────────────────

export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  school:             'École',
  user:               'Compte',
  student:            'Élève',
  teacher:            'Enseignant',
  parent:             'Parent',
  class:              'Classe',
  enrollment:         'Inscription',
  class_subject:      'Matière de classe',
  subject:            'Matière',
  academic_year:      'Année scolaire',
  academic_period:    'Période',
  assessment:         'Évaluation',
  attendance_session: 'Séance de présence',
  timetable_slot:     'Créneau',
  exam_session:       'Session d’examen',
  announcement:       'Annonce',
  fee_item:           'Frais',
  invoice:            'Facture',
  payment:            'Paiement',
}

export const RESOURCE_TYPES: string[] = Object.keys(RESOURCE_TYPE_LABELS)

// ── Badge tone ───────────────────────────────────────────────────────────────
// Derives a semantic colour for an action badge from keywords in the action
// name, so unmapped/new actions still get a sensible tone.

export type AuditTone = 'create' | 'update' | 'delete' | 'neutral'

export function actionTone(action: string): AuditTone {
  if (/(deactivat|cancel|withdraw|remov|unlink|delet|suspend|archiv)/.test(action)) return 'delete'
  if (/(updat|chang|assign|edit)/.test(action))                     return 'update'
  if (/(creat|record|publish|enroll|link|sav|reactivat|generat|add)/.test(action)) return 'create'
  return 'neutral'
}

export const TONE_BADGE: Record<AuditTone, string> = {
  create:  'bg-emerald-100 text-emerald-800',
  update:  'bg-blue-100 text-blue-800',
  delete:  'bg-red-100 text-red-800',
  neutral: 'bg-gray-100 text-gray-700',
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

export function resourceTypeLabel(rt: string | null): string {
  if (!rt) return '—'
  return RESOURCE_TYPE_LABELS[rt] ?? rt
}
