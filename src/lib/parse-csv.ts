// ─── CSV/grid parsing + tolerant import mapping ───────────────────────────────
//
// parseCsv turns CSV text into a string[][] grid (also used for XLSX via the
// sheet→CSV conversion). The readXRows functions then map a grid to validated
// rows for each import flow. They are deliberately tolerant of real school
// spreadsheets:
//   • smart header detection — scan the first rows and skip title/blank lines
//   • accent-insensitive French/English column aliases, any column order
//   • value auto-cleanup (gender / status / relationship) before validation
//   • repeated header rows inside the file are skipped, not treated as data
// The SAME functions run in the browser preview and on the server, so preview
// and final import behave identically. Validation is unchanged — normalisation
// only canonicalises known synonyms; unknown/missing required fields still error.

export function parseCsv(input: string): string[][] {
  let text = input
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // strip BOM

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } // escaped quote
        else inQuotes = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (c === '\r') {
      // ignore — the paired \n closes the row
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }

  // Drop fully-empty rows (blank lines anywhere, incl. before the header).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

// ─── Normalisation helpers ─────────────────────────────────────────────────────

// Accent-stripped, lowercased, whitespace-collapsed — for matching values.
function stripAccentsLower(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

// Header-cell / alias key: same as above but also unifies apostrophes so
// "Numéro d'admission" and "numero d'admission" match.
function normKey(s: string): string {
  return stripAccentsLower(s.replace(/[’‘`]/g, "'"))
}

// ─── Generic header detection + column mapping ────────────────────────────────

type FieldSpec<K extends string> = { key: K; aliases: string[]; positional: number }

type Located<K extends string> = {
  idx: Partial<Record<K, number>>
  dataStart: number
  skippedBefore: number
  headerMatchCount: number
  aliasMap: Map<string, K>
}

const SCAN_ROWS = 20

function buildAliasMap<K extends string>(specs: FieldSpec<K>[]): Map<string, K> {
  const m = new Map<string, K>()
  for (const s of specs) {
    m.set(normKey(s.key), s.key)
    for (const a of s.aliases) m.set(normKey(a), s.key)
  }
  return m
}

// How many distinct known columns a row's cells map to.
function countAliasMatches<K extends string>(cells: string[], aliasMap: Map<string, K>): number {
  const seen = new Set<K>()
  for (const cell of cells) {
    const k = aliasMap.get(normKey(cell))
    if (k && !seen.has(k)) seen.add(k)
  }
  return seen.size
}

// Find the real header row in the first SCAN_ROWS, skipping title rows before it.
function locateColumns<K extends string>(grid: string[][], specs: FieldSpec<K>[]): Located<K> {
  const aliasMap = buildAliasMap(specs)
  const scan = Math.min(grid.length, SCAN_ROWS)

  let bestRow = -1, bestCount = 0
  for (let r = 0; r < scan; r++) {
    const count = countAliasMatches(grid[r], aliasMap)
    if (count > bestCount) { bestCount = count; bestRow = r }
  }

  // Confident header: ≥2 matched columns anywhere in the scan window.
  // Otherwise honour a single-match header only at row 0 (legacy behaviour).
  let headerRow = -1
  if (bestCount >= 2) headerRow = bestRow
  else if (bestCount === 1 && bestRow === 0) headerRow = 0

  if (headerRow >= 0) {
    const idx: Partial<Record<K, number>> = {}
    grid[headerRow].forEach((cell, i) => {
      const k = aliasMap.get(normKey(cell))
      if (k && idx[k] === undefined) idx[k] = i
    })
    return { idx, dataStart: headerRow + 1, skippedBefore: headerRow, headerMatchCount: countAliasMatches(grid[headerRow], aliasMap), aliasMap }
  }

  // Positional fallback (no recognisable header): assume default column order.
  const idx: Partial<Record<K, number>> = {}
  for (const s of specs) idx[s.key] = s.positional
  return { idx, dataStart: 0, skippedBefore: 0, headerMatchCount: 0, aliasMap }
}

// ─── Result type + cleanup notes ──────────────────────────────────────────────

export type ImportParseResult<T> = {
  rows: T[]
  skippedRows: number   // title rows before header + repeated header rows
  notes: string[]       // short French notes for the preview banner
}

// A value counts as "normalised" when a non-empty input was rewritten to a
// different canonical form (e.g. "F" → female, "actif" → active).
function wasNormalised(raw: string, canonical: string): boolean {
  return raw.trim() !== '' && stripAccentsLower(raw) !== canonical
}

function plural(n: number): string { return n > 1 ? 's' : '' }

function makeNotes(skippedBefore: number, skippedRepeated: number, normalized: number): string[] {
  const notes: string[] = []
  if (skippedBefore > 0)   notes.push(`${skippedBefore} ligne${plural(skippedBefore)} ignorée${plural(skippedBefore)} avant l'en-tête`)
  if (skippedRepeated > 0) notes.push(`${skippedRepeated} ligne${plural(skippedRepeated)} d'en-tête répétée${plural(skippedRepeated)} ignorée${plural(skippedRepeated)}`)
  if (normalized > 0)      notes.push(`${normalized} valeur${plural(normalized)} normalisée${plural(normalized)} automatiquement`)
  return notes
}

// ─── Value normalisers ─────────────────────────────────────────────────────────

const GENDERS = new Set(['male', 'female', 'other'])
const STUDENT_STATUSES = new Set(['active', 'inactive', 'graduated'])
const SIMPLE_STATUSES = new Set(['active', 'inactive'])

function normGender(raw: string): string {
  const k = stripAccentsLower(raw)
  if (['male', 'm', 'masculin', 'homme', 'garcon'].includes(k)) return 'male'
  if (['female', 'f', 'feminin', 'femme', 'fille'].includes(k)) return 'female'
  if (['other', 'autre'].includes(k)) return 'other'
  return k
}

function normStatus(raw: string): string {
  const k = stripAccentsLower(raw)
  if (['active', 'actif', 'inscrit', 'inscrite'].includes(k)) return 'active'
  if (['inactive', 'inactif'].includes(k)) return 'inactive'
  if (['graduated', 'diplome', 'diplomee'].includes(k)) return 'graduated'
  return k
}

export function normaliseRelationship(value: string): 'father' | 'mother' | 'guardian' | 'other' {
  const k = stripAccentsLower(value)
  if (!k) return 'guardian'
  if (['father', 'pere', 'papa'].includes(k)) return 'father'
  if (['mother', 'mere', 'maman'].includes(k)) return 'mother'
  if (['guardian', 'tuteur', 'tutrice', 'responsable', 'parent'].includes(k)) return 'guardian'
  if (['other', 'autre'].includes(k)) return 'other'
  return 'guardian' // 'parent' & unknowns map to guardian (the links CHECK forbids 'parent')
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Shared per-row iteration context.
function prepare<K extends string>(grid: string[][], specs: FieldSpec<K>[]) {
  const loc = locateColumns(grid, specs)
  const get = (cells: string[], key: K): string => {
    const i = loc.idx[key]
    return i !== undefined && i >= 0 ? ((cells[i] ?? '').trim()) : ''
  }
  // A data row that is actually a (repeated) header: as many alias matches as
  // the detected header — real data never matches that many column labels.
  const isRepeatedHeader = (cells: string[]): boolean =>
    loc.headerMatchCount >= 2 && countAliasMatches(cells, loc.aliasMap) >= loc.headerMatchCount
  return { loc, get, isRepeatedHeader }
}

// ─── Classes (name, level, section) ────────────────────────────────────────────

export type ParsedClassRow = { line: number; name: string; level: string; section: string; error: string | null }

const CLASS_SPECS: FieldSpec<'name' | 'level' | 'section'>[] = [
  { key: 'name',    positional: 0, aliases: ['nom', 'classe', 'class'] },
  { key: 'level',   positional: 1, aliases: ['niveau'] },
  { key: 'section', positional: 2, aliases: [] },
]

export function readClassRows(grid: string[][]): ImportParseResult<ParsedClassRow> {
  const { loc, get, isRepeatedHeader } = prepare(grid, CLASS_SPECS)
  const out: ParsedClassRow[] = []
  let skippedRepeated = 0

  for (let r = loc.dataStart; r < grid.length; r++) {
    const cells = grid[r]
    if (isRepeatedHeader(cells)) { skippedRepeated++; continue }
    const name = get(cells, 'name'), level = get(cells, 'level'), section = get(cells, 'section')

    let error: string | null = null
    if (!name)                    error = 'Le nom de la classe est requis.'
    else if (name.length > 100)   error = 'Nom trop long (100 caractères max).'
    else if (level.length > 50)   error = 'Niveau trop long (50 caractères max).'
    else if (section.length > 50) error = 'Section trop longue (50 caractères max).'

    out.push({ line: r + 1, name, level, section, error })
  }
  return { rows: out, skippedRows: loc.skippedBefore + skippedRepeated, notes: makeNotes(loc.skippedBefore, skippedRepeated, 0) }
}

// ─── Subjects (name, code, coefficient) ────────────────────────────────────────

export type ParsedSubjectRow = { line: number; name: string; code: string; coefficient: string; error: string | null }

const SUBJECT_SPECS: FieldSpec<'name' | 'code' | 'coefficient'>[] = [
  { key: 'name',        positional: 0, aliases: ['nom', 'matiere', 'subject'] },
  { key: 'code',        positional: 1, aliases: [] },
  { key: 'coefficient', positional: 2, aliases: ['coef', 'coeff'] },
]

export function readSubjectRows(grid: string[][]): ImportParseResult<ParsedSubjectRow> {
  const { loc, get, isRepeatedHeader } = prepare(grid, SUBJECT_SPECS)
  const out: ParsedSubjectRow[] = []
  let skippedRepeated = 0

  for (let r = loc.dataStart; r < grid.length; r++) {
    const cells = grid[r]
    if (isRepeatedHeader(cells)) { skippedRepeated++; continue }
    const name = get(cells, 'name'), code = get(cells, 'code'), coefficient = get(cells, 'coefficient')

    let error: string | null = null
    if (!name)                   error = 'Le nom de la matière est requis.'
    else if (name.length > 100)  error = 'Nom trop long (100 caractères max).'
    else if (code.length > 20)   error = 'Code trop long (20 caractères max).'
    else if (coefficient !== '') {
      const n = Number(coefficient.replace(',', '.'))
      if (!Number.isFinite(n) || n <= 0) error = 'Coefficient invalide (nombre > 0).'
      else if (n > 100)                  error = 'Coefficient trop élevé (100 max).'
    }

    out.push({ line: r + 1, name, code, coefficient, error })
  }
  return { rows: out, skippedRows: loc.skippedBefore + skippedRepeated, notes: makeNotes(loc.skippedBefore, skippedRepeated, 0) }
}

// ─── Students (first_name, last_name, admission_number, gender, dob, status) ──

export type ParsedStudentRow = {
  line: number; first_name: string; last_name: string; admission_number: string
  gender: string; date_of_birth: string; status: string; error: string | null
}

const STUDENT_SPECS: FieldSpec<'first_name' | 'last_name' | 'admission_number' | 'gender' | 'date_of_birth' | 'status'>[] = [
  { key: 'first_name',       positional: 0, aliases: ['firstname', 'prenom'] },
  { key: 'last_name',        positional: 1, aliases: ['lastname', 'nom'] },
  { key: 'admission_number', positional: 2, aliases: ['admission', 'matricule', 'numero', "numero d'admission", "n° d'admission", 'no admission'] },
  { key: 'gender',           positional: 3, aliases: ['sexe'] },
  { key: 'date_of_birth',    positional: 4, aliases: ['dob', 'naissance', 'date naissance', 'date de naissance'] },
  { key: 'status',           positional: 5, aliases: ['statut'] },
]

export function readStudentRows(grid: string[][]): ImportParseResult<ParsedStudentRow> {
  const { loc, get, isRepeatedHeader } = prepare(grid, STUDENT_SPECS)
  const out: ParsedStudentRow[] = []
  let skippedRepeated = 0
  let normalized = 0

  for (let r = loc.dataStart; r < grid.length; r++) {
    const cells = grid[r]
    if (isRepeatedHeader(cells)) { skippedRepeated++; continue }

    const first_name       = get(cells, 'first_name')
    const last_name        = get(cells, 'last_name')
    const admission_number = get(cells, 'admission_number')
    const genderRaw        = get(cells, 'gender')
    const date_of_birth    = get(cells, 'date_of_birth')
    const statusRaw        = get(cells, 'status')

    const gender = genderRaw ? normGender(genderRaw) : ''
    const status = statusRaw ? normStatus(statusRaw) : ''
    if (genderRaw && GENDERS.has(gender) && wasNormalised(genderRaw, gender)) normalized++
    if (statusRaw && STUDENT_STATUSES.has(status) && wasNormalised(statusRaw, status)) normalized++

    let error: string | null = null
    if (!first_name)                          error = 'Le prénom est requis.'
    else if (first_name.length > 100)          error = 'Prénom trop long (100 caractères max).'
    else if (!last_name)                       error = 'Le nom est requis.'
    else if (last_name.length > 100)           error = 'Nom trop long (100 caractères max).'
    else if (!admission_number)                error = "Le numéro d'admission est requis."
    else if (admission_number.length > 50)     error = "Numéro d'admission trop long (50 caractères max)."
    else if (gender && !GENDERS.has(gender))   error = 'Sexe invalide (male, female ou other).'
    else if (date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(date_of_birth)) error = 'Date de naissance invalide (AAAA-MM-JJ).'
    else if (status && !STUDENT_STATUSES.has(status)) error = 'Statut invalide (active, inactive ou graduated).'

    out.push({ line: r + 1, first_name, last_name, admission_number, gender, date_of_birth, status, error })
  }
  return { rows: out, skippedRows: loc.skippedBefore + skippedRepeated, notes: makeNotes(loc.skippedBefore, skippedRepeated, normalized) }
}

// ─── Teachers (first_name, last_name, email, phone, subject, status) ──────────

export type ParsedTeacherRow = {
  line: number; first_name: string; last_name: string; email: string
  phone: string; subject: string; status: string; error: string | null
}

const TEACHER_SPECS: FieldSpec<'first_name' | 'last_name' | 'email' | 'phone' | 'subject' | 'status'>[] = [
  { key: 'first_name', positional: 0, aliases: ['firstname', 'prenom'] },
  { key: 'last_name',  positional: 1, aliases: ['lastname', 'nom'] },
  { key: 'email',      positional: 2, aliases: ['mail', 'courriel', 'e-mail', 'adresse email'] },
  { key: 'phone',      positional: 3, aliases: ['telephone', 'tel', 'contact'] },
  { key: 'subject',    positional: 4, aliases: ['subjects', 'matiere', 'matieres', 'discipline'] },
  { key: 'status',     positional: 5, aliases: ['statut'] },
]

export function readTeacherRows(grid: string[][]): ImportParseResult<ParsedTeacherRow> {
  const { loc, get, isRepeatedHeader } = prepare(grid, TEACHER_SPECS)
  const out: ParsedTeacherRow[] = []
  let skippedRepeated = 0
  let normalized = 0

  for (let r = loc.dataStart; r < grid.length; r++) {
    const cells = grid[r]
    if (isRepeatedHeader(cells)) { skippedRepeated++; continue }

    const first_name = get(cells, 'first_name')
    const last_name  = get(cells, 'last_name')
    const email      = get(cells, 'email')
    const phone      = get(cells, 'phone')
    const subject    = get(cells, 'subject')
    const statusRaw  = get(cells, 'status')

    const status = statusRaw ? normStatus(statusRaw) : ''
    if (statusRaw && SIMPLE_STATUSES.has(status) && wasNormalised(statusRaw, status)) normalized++

    let error: string | null = null
    if (!first_name)                          error = 'Le prénom est requis.'
    else if (first_name.length > 100)          error = 'Prénom trop long (100 caractères max).'
    else if (!last_name)                       error = 'Le nom est requis.'
    else if (last_name.length > 100)           error = 'Nom trop long (100 caractères max).'
    else if (email && !EMAIL_RE.test(email))   error = 'Adresse email invalide.'
    else if (email.length > 200)               error = 'Email trop long (200 caractères max).'
    else if (phone.length > 30)                error = 'Numéro trop long (30 caractères max).'
    else if (subject.length > 100)             error = 'Matière trop longue (100 caractères max).'
    else if (status && !SIMPLE_STATUSES.has(status)) error = 'Statut invalide (active ou inactive).'

    out.push({ line: r + 1, first_name, last_name, email, phone, subject, status, error })
  }
  return { rows: out, skippedRows: loc.skippedBefore + skippedRepeated, notes: makeNotes(loc.skippedBefore, skippedRepeated, normalized) }
}

// ─── Parents (first_name, last_name, email, phone, admission, relationship, status) ─

export type ParsedParentRow = {
  line: number; first_name: string; last_name: string; email: string; phone: string
  student_admission_number: string; relationship: string; status: string; error: string | null
}

const PARENT_SPECS: FieldSpec<'first_name' | 'last_name' | 'email' | 'phone' | 'student_admission_number' | 'relationship' | 'status'>[] = [
  { key: 'first_name', positional: 0, aliases: ['firstname', 'prenom'] },
  { key: 'last_name',  positional: 1, aliases: ['lastname', 'nom'] },
  { key: 'email',      positional: 2, aliases: ['mail', 'courriel', 'e-mail'] },
  { key: 'phone',      positional: 3, aliases: ['telephone', 'tel', 'contact'] },
  { key: 'student_admission_number', positional: 4, aliases: ['admission_number', 'admission', 'matricule', 'eleve', 'matricule eleve', 'numero eleve', "numero d'admission", "numero d'admission eleve", "matricule de l'eleve"] },
  { key: 'relationship', positional: 5, aliases: ['relation', 'lien', 'parente', 'lien de parente'] },
  { key: 'status',     positional: 6, aliases: ['statut'] },
]

export function readParentRows(grid: string[][]): ImportParseResult<ParsedParentRow> {
  const { loc, get, isRepeatedHeader } = prepare(grid, PARENT_SPECS)
  const out: ParsedParentRow[] = []
  let skippedRepeated = 0
  let normalized = 0

  for (let r = loc.dataStart; r < grid.length; r++) {
    const cells = grid[r]
    if (isRepeatedHeader(cells)) { skippedRepeated++; continue }

    const first_name = get(cells, 'first_name')
    const last_name  = get(cells, 'last_name')
    const email      = get(cells, 'email')
    const phone      = get(cells, 'phone')
    const student_admission_number = get(cells, 'student_admission_number')
    const relRaw     = get(cells, 'relationship')
    const statusRaw  = get(cells, 'status')

    const relationship = normaliseRelationship(relRaw)
    const status = statusRaw ? normStatus(statusRaw) : ''
    if (relRaw && wasNormalised(relRaw, relationship)) normalized++
    if (statusRaw && SIMPLE_STATUSES.has(status) && wasNormalised(statusRaw, status)) normalized++

    let error: string | null = null
    if (!first_name)                          error = 'Le prénom est requis.'
    else if (first_name.length > 100)          error = 'Prénom trop long (100 caractères max).'
    else if (!last_name)                       error = 'Le nom est requis.'
    else if (last_name.length > 100)           error = 'Nom trop long (100 caractères max).'
    else if (!email && !phone)                 error = 'Téléphone ou email requis.'
    else if (email && !EMAIL_RE.test(email))   error = 'Adresse email invalide.'
    else if (email.length > 200)               error = 'Email trop long (200 caractères max).'
    else if (phone.length > 30)                error = 'Numéro trop long (30 caractères max).'
    else if (student_admission_number.length > 50) error = "Numéro d'admission trop long (50 caractères max)."
    else if (status && !SIMPLE_STATUSES.has(status)) error = 'Statut invalide (active ou inactive).'

    out.push({ line: r + 1, first_name, last_name, email, phone, student_admission_number, relationship, status, error })
  }
  return { rows: out, skippedRows: loc.skippedBefore + skippedRepeated, notes: makeNotes(loc.skippedBefore, skippedRepeated, normalized) }
}
