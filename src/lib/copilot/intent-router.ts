// ─── Copilot intent router (deterministic, no LLM) ───────────────────────────
//
// Normalises the query, extracts an explicit student name when present, and
// otherwise scores it against per-intent keyword sets. Fully deterministic.

import type { RoutedQuery, CopilotIntent } from './types'

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, ' ').replace(/\s+/g, ' ').trim()
}

const RULES: { intent: CopilotIntent; keywords: string[] }[] = [
  { intent: 'at_risk',         keywords: ['risque', 'alerte', 'decrochage', 'vigilance', 'soutien', 'en difficulte'] },
  { intent: 'finance',         keywords: ['finance', 'financier', 'recouvrement', 'impaye', 'facture', 'solde', 'frais', 'debiteur', 'encaiss', 'paiement'] },
  { intent: 'attendance',      keywords: ['assiduite', 'presence', 'absence', 'retard', 'absenteisme'] },
  { intent: 'academic',        keywords: ['academique', 'resultat', 'moyenne', 'reussite', 'classement', 'matiere', 'bulletin', 'mention', 'note'] },
  { intent: 'admissions',      keywords: ['candidature', 'admission', 'postul', 'inscription en ligne'] },
  { intent: 'transport',       keywords: ['transport', 'bus', 'ramassage', 'itineraire', 'vehicule', 'chauffeur'] },
  { intent: 'timetable',       keywords: ['emploi du temps', 'horaire', 'planning', 'seance'] },
  { intent: 'homework',        keywords: ['devoir', 'homework', 'travail a la maison'] },
  { intent: 'school_overview', keywords: ['vue d ensemble', 'ensemble', 'tableau de bord', 'global', 'situation generale', 'etat de l ecole', 'synthese', 'resume de l ecole'] },
]

const STUDENT_TRIGGER = /(?:eleve|resume|dossier|profil|comment va|situation de|360)\b/

function extractStudentName(raw: string): string {
  return raw
    .replace(/^.*?(?:[ée]l[èe]ve|r[ée]sum[ée]|dossier|profil|comment va|situation de|360)\s+(?:de\s+|d[' ]\s*)?/i, '')
    .replace(/[?.!]+$/, '')
    .trim()
}

export function routeIntent(query: string): RoutedQuery {
  const raw = query.trim()
  if (!raw) return { intent: 'help', entities: {} }
  const q = normalize(raw)

  if (/\b(aide|help|que peux[- ]tu|capacites)\b/.test(q)) return { intent: 'help', entities: {} }

  // Explicit student trigger ("résumé de X", "élève X", "comment va X").
  if (STUDENT_TRIGGER.test(q)) {
    const name = extractStudentName(raw)
    if (name.length >= 2) return { intent: 'student_360', entities: { studentName: name } }
  }

  // Keyword scoring — highest hit count wins.
  let best: { intent: CopilotIntent; score: number } = { intent: 'unknown', score: 0 }
  for (const rule of RULES) {
    const score = rule.keywords.reduce((s, k) => s + (q.includes(normalize(k)) ? 1 : 0), 0)
    if (score > best.score) best = { intent: rule.intent, score }
  }
  if (best.score > 0) return { intent: best.intent, entities: {} }

  // A bare name (≤3 alphabetic words) → treat as a student lookup.
  if (/^[a-zàâäéèêëîïôöùûüç' -]{2,60}$/i.test(raw) && raw.split(/\s+/).length <= 3) {
    return { intent: 'student_360', entities: { studentName: raw } }
  }

  return { intent: 'unknown', entities: {} }
}

export const SUGGESTED_PROMPTS = [
  'Vue d’ensemble de l’école',
  'Quels élèves sont à risque ?',
  'Résumé financier',
  'Résultats académiques',
  'Assiduité générale',
  'Où en sont les candidatures ?',
]
