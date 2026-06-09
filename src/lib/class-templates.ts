// ─── School structure templates (Phase: class management) ────────────────────
//
// Pure data + helpers shared by the templates page (preview) and the server
// action (creation), so both agree on exactly which classes a template yields.
// Senegalese school structure: primaire (CI→CM2), collège (6e→3e), lycée
// (2nde→Terminale). Section letters A/B for collège/lycée.

export type TemplateClass = {
  name:    string
  level:   string
  section: string | null
}

export type ClassTemplate = {
  key:         string
  label:       string
  description: string
  classes:     TemplateClass[]
}

const PRIMAIRE: TemplateClass[] = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'].map((n) => ({
  name: n, level: n, section: null,
}))

function withSections(grades: string[], sections: string[]): TemplateClass[] {
  const out: TemplateClass[] = []
  for (const g of grades) {
    for (const s of sections) out.push({ name: `${g} ${s}`, level: g, section: s })
  }
  return out
}

const COLLEGE = withSections(['6ème', '5ème', '4ème', '3ème'], ['A', 'B'])
const LYCEE   = withSections(['2nde', '1ère', 'Terminale'], ['A', 'B'])

export const CLASS_TEMPLATES: ClassTemplate[] = [
  { key: 'primaire',         label: 'École primaire',     description: 'CI, CP, CE1, CE2, CM1, CM2',          classes: PRIMAIRE },
  { key: 'college',          label: 'Collège',            description: '6ème à 3ème (sections A & B)',        classes: COLLEGE },
  { key: 'lycee',            label: 'Lycée',              description: '2nde, 1ère, Terminale (A & B)',       classes: LYCEE },
  { key: 'primaire_college', label: 'Primaire + Collège', description: 'CI à 3ème',                            classes: [...PRIMAIRE, ...COLLEGE] },
  { key: 'college_lycee',    label: 'Collège + Lycée',    description: '6ème à Terminale',                    classes: [...COLLEGE, ...LYCEE] },
]

export function getClassTemplate(key: string): ClassTemplate | null {
  return CLASS_TEMPLATES.find((t) => t.key === key) ?? null
}
