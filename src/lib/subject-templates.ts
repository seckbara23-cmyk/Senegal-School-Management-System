// ─── Subject catalogue templates + default preload (Senegal) ─────────────────
//
// Pure data shared by the templates page (preview), the CSV import preview and
// the server actions, so they all agree on exactly which subjects a template /
// the default catalogue yields. Mirrors lib/class-templates.ts.
//
// IMPORTANT: this module is imported by CLIENT preview components, so it must
// stay free of runtime server imports. preloadDefaultSubjectsForSchool() uses a
// TYPE-ONLY Supabase import (erased at build) and leaves the audit log to its
// (server-side) callers.

import type { SupabaseClient } from '@supabase/supabase-js'

export type SubjectDef = {
  name:        string
  code:        string
  coefficient: number
}

export type SubjectTemplate = {
  key:         string
  label:       string
  description: string
  subjects:    SubjectDef[]
}

const PRIMAIRE: SubjectDef[] = [
  { name: 'Français',            code: 'FRA',  coefficient: 4 },
  { name: 'Mathématiques',       code: 'MATH', coefficient: 4 },
  { name: 'Éducation civique',   code: 'EC',   coefficient: 1 },
  { name: 'Histoire-Géographie', code: 'HG',   coefficient: 2 },
  { name: 'Sciences',            code: 'SCI',  coefficient: 2 },
  { name: 'Lecture',             code: 'LEC',  coefficient: 2 },
  { name: 'Écriture',            code: 'ECR',  coefficient: 1 },
  { name: 'EPS',                 code: 'EPS',  coefficient: 1 },
  { name: 'Arts plastiques',     code: 'ART',  coefficient: 1 },
]

const COLLEGE: SubjectDef[] = [
  { name: 'Français',            code: 'FRA',  coefficient: 4 },
  { name: 'Mathématiques',       code: 'MATH', coefficient: 4 },
  { name: 'SVT',                 code: 'SVT',  coefficient: 2 },
  { name: 'Physique-Chimie',     code: 'PC',   coefficient: 2 },
  { name: 'Histoire-Géographie', code: 'HG',   coefficient: 2 },
  { name: 'Anglais',             code: 'ANG',  coefficient: 3 },
  { name: 'Espagnol',            code: 'ESP',  coefficient: 2 },
  { name: 'Éducation civique',   code: 'EC',   coefficient: 1 },
  { name: 'EPS',                 code: 'EPS',  coefficient: 1 },
  { name: 'Informatique',        code: 'INFO', coefficient: 1 },
]

const LYCEE: SubjectDef[] = [
  { name: 'Français',            code: 'FRA',   coefficient: 3 },
  { name: 'Philosophie',         code: 'PHILO', coefficient: 2 },
  { name: 'Mathématiques',       code: 'MATH',  coefficient: 5 },
  { name: 'SVT',                 code: 'SVT',   coefficient: 3 },
  { name: 'Physique-Chimie',     code: 'PC',    coefficient: 4 },
  { name: 'Histoire-Géographie', code: 'HG',    coefficient: 3 },
  { name: 'Anglais',             code: 'ANG',   coefficient: 2 },
  { name: 'Espagnol',            code: 'ESP',   coefficient: 2 },
  { name: 'EPS',                 code: 'EPS',   coefficient: 1 },
  { name: 'Informatique',        code: 'INFO',  coefficient: 1 },
  { name: 'Économie',            code: 'ECO',   coefficient: 2 },
]

export const SUBJECT_TEMPLATES: SubjectTemplate[] = [
  { key: 'primaire', label: 'Primaire', description: 'Français, Maths, Sciences, EPS…', subjects: PRIMAIRE },
  { key: 'college',  label: 'Collège',  description: 'Français, Maths, SVT, PC, langues…', subjects: COLLEGE },
  { key: 'lycee',    label: 'Lycée',    description: 'Philosophie, Maths, sciences, Économie…', subjects: LYCEE },
]

export function getSubjectTemplate(key: string): SubjectTemplate | null {
  return SUBJECT_TEMPLATES.find((t) => t.key === key) ?? null
}

function dedupeByName(list: SubjectDef[]): SubjectDef[] {
  const seen = new Set<string>()
  const out: SubjectDef[] = []
  for (const s of list) {
    const k = s.name.trim().toLowerCase()
    if (!seen.has(k)) { seen.add(k); out.push(s) }
  }
  return out
}

// The ready-made default catalogue: the distinct union of all three levels
// (first occurrence wins for code/coefficient). Used by "Charger les matières
// par défaut" and the automatic preload on school creation.
export const DEFAULT_SUBJECTS: SubjectDef[] = dedupeByName([...PRIMAIRE, ...COLLEGE, ...LYCEE])

/**
 * Insert any missing default subjects for a school. Server-side only — the
 * caller MUST pass a server-resolved schoolId (never one from the client) and
 * is responsible for writing the audit log. Case-insensitive duplicate
 * detection; never overwrites existing subjects.
 */
export async function preloadDefaultSubjectsForSchool(
  client: SupabaseClient,
  schoolId: string,
): Promise<{ created: number; skipped: number; failed: boolean }> {
  const { data: existing } = await client
    .from('subjects')
    .select('name')
    .eq('school_id', schoolId)

  const have = new Set(((existing ?? []) as { name: string }[]).map((s) => s.name.trim().toLowerCase()))
  const toCreate = DEFAULT_SUBJECTS.filter((s) => !have.has(s.name.toLowerCase()))

  if (toCreate.length === 0) {
    return { created: 0, skipped: DEFAULT_SUBJECTS.length, failed: false }
  }

  const rows = toCreate.map((s) => ({
    school_id: schoolId, name: s.name, code: s.code, coefficient: s.coefficient,
  }))
  const { error } = await client.from('subjects').insert(rows)
  if (error) {
    return { created: 0, skipped: DEFAULT_SUBJECTS.length, failed: true }
  }
  return { created: toCreate.length, skipped: DEFAULT_SUBJECTS.length - toCreate.length, failed: false }
}
