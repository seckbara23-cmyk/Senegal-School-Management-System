// ─── Minimal CSV parser (no dependencies) ─────────────────────────────────────
//
// RFC-4180-ish: handles quoted fields, escaped quotes (""), commas and newlines
// inside quotes, CRLF or LF line endings, and a leading UTF-8 BOM. Pure and
// isomorphic so it can run both in the browser (import preview) and on the
// server (authoritative re-validation). We avoid a heavy spreadsheet dependency;
// CSV is opened and saved natively by Excel and Google Sheets.

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
  // Flush the final field/row when the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }

  // Drop fully-empty rows (e.g. trailing blank lines).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

export type ParsedClassRow = {
  line:    number          // 1-based source line (header = 1)
  name:    string
  level:   string
  section: string
  error:   string | null
}

const HEADER_ALIASES: Record<string, 'name' | 'level' | 'section'> = {
  name: 'name', nom: 'name', classe: 'name',
  level: 'level', niveau: 'level',
  section: 'section',
}

/**
 * Map raw CSV rows to class rows with per-row validation. The first row is
 * treated as a header when it contains a recognised column name; otherwise the
 * columns are assumed to be name, level, section in order.
 */
export function readClassRows(grid: string[][]): ParsedClassRow[] {
  if (grid.length === 0) return []

  const header = grid[0].map((h) => h.trim().toLowerCase())
  const looksLikeHeader = header.some((h) => h in HEADER_ALIASES)

  let nameIdx = 0, levelIdx = 1, sectionIdx = 2
  let dataStart = 0
  if (looksLikeHeader) {
    nameIdx = header.findIndex((h) => HEADER_ALIASES[h] === 'name')
    levelIdx = header.findIndex((h) => HEADER_ALIASES[h] === 'level')
    sectionIdx = header.findIndex((h) => HEADER_ALIASES[h] === 'section')
    dataStart = 1
  }

  const out: ParsedClassRow[] = []
  for (let r = dataStart; r < grid.length; r++) {
    const cells = grid[r]
    const name    = (nameIdx    >= 0 ? cells[nameIdx]    : '')?.trim() ?? ''
    const level   = (levelIdx   >= 0 ? cells[levelIdx]   : '')?.trim() ?? ''
    const section = (sectionIdx >= 0 ? cells[sectionIdx] : '')?.trim() ?? ''

    let error: string | null = null
    if (!name)                 error = 'Le nom de la classe est requis.'
    else if (name.length > 100) error = 'Nom trop long (100 caractères max).'
    else if (level.length > 50) error = 'Niveau trop long (50 caractères max).'
    else if (section.length > 50) error = 'Section trop longue (50 caractères max).'

    out.push({ line: r + 1, name, level, section, error })
  }
  return out
}

// ─── Subjects (name, code, coefficient) ───────────────────────────────────────

export type ParsedSubjectRow = {
  line:        number
  name:        string
  code:        string
  coefficient: string   // raw text; numeric validation happens here
  error:       string | null
}

const SUBJECT_HEADER_ALIASES: Record<string, 'name' | 'code' | 'coefficient'> = {
  name: 'name', nom: 'name', matiere: 'name', 'matière': 'name',
  code: 'code',
  coefficient: 'coefficient', coef: 'coefficient', coeff: 'coefficient',
}

/**
 * Map raw CSV rows to subject rows with per-row validation. The first row is
 * treated as a header when it contains a recognised column name; otherwise the
 * columns are assumed to be name, code, coefficient in order. Only `name` is
 * required; `coefficient`, if present, must be a number > 0 and <= 100.
 */
export function readSubjectRows(grid: string[][]): ParsedSubjectRow[] {
  if (grid.length === 0) return []

  const header = grid[0].map((h) => h.trim().toLowerCase())
  const looksLikeHeader = header.some((h) => h in SUBJECT_HEADER_ALIASES)

  let nameIdx = 0, codeIdx = 1, coefIdx = 2
  let dataStart = 0
  if (looksLikeHeader) {
    nameIdx = header.findIndex((h) => SUBJECT_HEADER_ALIASES[h] === 'name')
    codeIdx = header.findIndex((h) => SUBJECT_HEADER_ALIASES[h] === 'code')
    coefIdx = header.findIndex((h) => SUBJECT_HEADER_ALIASES[h] === 'coefficient')
    dataStart = 1
  }

  const out: ParsedSubjectRow[] = []
  for (let r = dataStart; r < grid.length; r++) {
    const cells = grid[r]
    const name = (nameIdx >= 0 ? cells[nameIdx] : '')?.trim() ?? ''
    const code = (codeIdx >= 0 ? cells[codeIdx] : '')?.trim() ?? ''
    const coefficient = (coefIdx >= 0 ? cells[coefIdx] : '')?.trim() ?? ''

    let error: string | null = null
    if (!name)                  error = 'Le nom de la matière est requis.'
    else if (name.length > 100)  error = 'Nom trop long (100 caractères max).'
    else if (code.length > 20)   error = 'Code trop long (20 caractères max).'
    else if (coefficient !== '') {
      const n = Number(coefficient.replace(',', '.'))
      if (!Number.isFinite(n) || n <= 0)  error = 'Coefficient invalide (nombre > 0).'
      else if (n > 100)                   error = 'Coefficient trop élevé (100 max).'
    }

    out.push({ line: r + 1, name, code, coefficient, error })
  }
  return out
}

// ─── Students (first_name, last_name, admission_number, gender, dob, status) ──

export type ParsedStudentRow = {
  line:             number
  first_name:       string
  last_name:        string
  admission_number: string
  gender:           string
  date_of_birth:    string
  status:           string
  error:            string | null
}

const STUDENT_HEADER_ALIASES: Record<string, 'first_name' | 'last_name' | 'admission_number' | 'gender' | 'date_of_birth' | 'status'> = {
  first_name: 'first_name', firstname: 'first_name', prenom: 'first_name', 'prénom': 'first_name',
  last_name: 'last_name', lastname: 'last_name', nom: 'last_name',
  admission_number: 'admission_number', admission: 'admission_number', matricule: 'admission_number', numero: 'admission_number', 'numéro': 'admission_number',
  gender: 'gender', sexe: 'gender',
  date_of_birth: 'date_of_birth', dob: 'date_of_birth', naissance: 'date_of_birth', date_naissance: 'date_of_birth',
  status: 'status', statut: 'status',
}

const GENDERS = new Set(['male', 'female', 'other'])
const STUDENT_STATUSES = new Set(['active', 'inactive', 'graduated'])

/**
 * Map raw CSV rows to student rows with per-row validation. The first row is
 * treated as a header when it contains a recognised column name; otherwise the
 * columns are assumed to be first_name, last_name, admission_number, gender,
 * date_of_birth, status in order. first_name/last_name/admission_number are
 * required; gender (male|female|other) and status (active|inactive|graduated)
 * are validated when present; date_of_birth must be AAAA-MM-JJ when present.
 */
export function readStudentRows(grid: string[][]): ParsedStudentRow[] {
  if (grid.length === 0) return []

  const header = grid[0].map((h) => h.trim().toLowerCase())
  const looksLikeHeader = header.some((h) => h in STUDENT_HEADER_ALIASES)

  let firstIdx = 0, lastIdx = 1, admIdx = 2, genIdx = 3, dobIdx = 4, statusIdx = 5
  let dataStart = 0
  if (looksLikeHeader) {
    firstIdx  = header.findIndex((h) => STUDENT_HEADER_ALIASES[h] === 'first_name')
    lastIdx   = header.findIndex((h) => STUDENT_HEADER_ALIASES[h] === 'last_name')
    admIdx    = header.findIndex((h) => STUDENT_HEADER_ALIASES[h] === 'admission_number')
    genIdx    = header.findIndex((h) => STUDENT_HEADER_ALIASES[h] === 'gender')
    dobIdx    = header.findIndex((h) => STUDENT_HEADER_ALIASES[h] === 'date_of_birth')
    statusIdx = header.findIndex((h) => STUDENT_HEADER_ALIASES[h] === 'status')
    dataStart = 1
  }

  const cell = (cells: string[], i: number) => (i >= 0 ? cells[i] : '')?.trim() ?? ''

  const out: ParsedStudentRow[] = []
  for (let r = dataStart; r < grid.length; r++) {
    const cells = grid[r]
    const first_name       = cell(cells, firstIdx)
    const last_name        = cell(cells, lastIdx)
    const admission_number = cell(cells, admIdx)
    const gender           = cell(cells, genIdx).toLowerCase()
    const date_of_birth    = cell(cells, dobIdx)
    const status           = cell(cells, statusIdx).toLowerCase()

    let error: string | null = null
    if (!first_name)                       error = 'Le prénom est requis.'
    else if (first_name.length > 100)       error = 'Prénom trop long (100 caractères max).'
    else if (!last_name)                    error = 'Le nom est requis.'
    else if (last_name.length > 100)        error = 'Nom trop long (100 caractères max).'
    else if (!admission_number)             error = "Le numéro d'admission est requis."
    else if (admission_number.length > 50)  error = "Numéro d'admission trop long (50 caractères max)."
    else if (gender && !GENDERS.has(gender)) error = 'Sexe invalide (male, female ou other).'
    else if (date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(date_of_birth)) error = 'Date de naissance invalide (AAAA-MM-JJ).'
    else if (status && !STUDENT_STATUSES.has(status)) error = 'Statut invalide (active, inactive ou graduated).'

    out.push({ line: r + 1, first_name, last_name, admission_number, gender, date_of_birth, status, error })
  }
  return out
}

// ─── Shared ────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ─── Teachers (first_name, last_name, email, phone, subject, status) ──────────

export type ParsedTeacherRow = {
  line:       number
  first_name: string
  last_name:  string
  email:      string
  phone:      string
  subject:    string
  status:     string
  error:      string | null
}

const TEACHER_HEADER_ALIASES: Record<string, 'first_name' | 'last_name' | 'email' | 'phone' | 'subject' | 'status'> = {
  first_name: 'first_name', firstname: 'first_name', prenom: 'first_name', 'prénom': 'first_name',
  last_name: 'last_name', lastname: 'last_name', nom: 'last_name',
  email: 'email', mail: 'email', courriel: 'email', 'e-mail': 'email',
  phone: 'phone', telephone: 'phone', 'téléphone': 'phone', tel: 'phone',
  subject: 'subject', subjects: 'subject', matiere: 'subject', 'matière': 'subject', matieres: 'subject', 'matières': 'subject',
  status: 'status', statut: 'status',
}

const SIMPLE_STATUSES = new Set(['active', 'inactive'])

/**
 * Map raw CSV/XLSX rows to teacher rows with per-row validation. The first row
 * is treated as a header when it contains a recognised column name; otherwise
 * the columns are assumed to be first_name, last_name, email, phone, subject,
 * status in order. first_name/last_name are required; email must be valid when
 * present; status (active|inactive) is validated when present.
 */
export function readTeacherRows(grid: string[][]): ParsedTeacherRow[] {
  if (grid.length === 0) return []

  const header = grid[0].map((h) => h.trim().toLowerCase())
  const looksLikeHeader = header.some((h) => h in TEACHER_HEADER_ALIASES)

  let firstIdx = 0, lastIdx = 1, emailIdx = 2, phoneIdx = 3, subjectIdx = 4, statusIdx = 5
  let dataStart = 0
  if (looksLikeHeader) {
    firstIdx   = header.findIndex((h) => TEACHER_HEADER_ALIASES[h] === 'first_name')
    lastIdx    = header.findIndex((h) => TEACHER_HEADER_ALIASES[h] === 'last_name')
    emailIdx   = header.findIndex((h) => TEACHER_HEADER_ALIASES[h] === 'email')
    phoneIdx   = header.findIndex((h) => TEACHER_HEADER_ALIASES[h] === 'phone')
    subjectIdx = header.findIndex((h) => TEACHER_HEADER_ALIASES[h] === 'subject')
    statusIdx  = header.findIndex((h) => TEACHER_HEADER_ALIASES[h] === 'status')
    dataStart  = 1
  }

  const cell = (cells: string[], i: number) => (i >= 0 ? cells[i] : '')?.trim() ?? ''

  const out: ParsedTeacherRow[] = []
  for (let r = dataStart; r < grid.length; r++) {
    const cells = grid[r]
    const first_name = cell(cells, firstIdx)
    const last_name  = cell(cells, lastIdx)
    const email      = cell(cells, emailIdx)
    const phone      = cell(cells, phoneIdx)
    const subject    = cell(cells, subjectIdx)
    const status     = cell(cells, statusIdx).toLowerCase()

    let error: string | null = null
    if (!first_name)                         error = 'Le prénom est requis.'
    else if (first_name.length > 100)         error = 'Prénom trop long (100 caractères max).'
    else if (!last_name)                      error = 'Le nom est requis.'
    else if (last_name.length > 100)          error = 'Nom trop long (100 caractères max).'
    else if (email && !EMAIL_RE.test(email))  error = 'Adresse email invalide.'
    else if (email.length > 200)              error = 'Email trop long (200 caractères max).'
    else if (phone.length > 30)               error = 'Numéro trop long (30 caractères max).'
    else if (subject.length > 100)            error = 'Matière trop longue (100 caractères max).'
    else if (status && !SIMPLE_STATUSES.has(status)) error = 'Statut invalide (active ou inactive).'

    out.push({ line: r + 1, first_name, last_name, email, phone, subject, status, error })
  }
  return out
}

// ─── Parents (first_name, last_name, email, phone, admission, relationship, status) ─

export type ParsedParentRow = {
  line:                     number
  first_name:               string
  last_name:                string
  email:                    string
  phone:                    string
  student_admission_number: string
  relationship:             string   // normalised: father | mother | guardian | other
  status:                   string
  error:                    string | null
}

const PARENT_HEADER_ALIASES: Record<string, 'first_name' | 'last_name' | 'email' | 'phone' | 'student_admission_number' | 'relationship' | 'status'> = {
  first_name: 'first_name', firstname: 'first_name', prenom: 'first_name', 'prénom': 'first_name',
  last_name: 'last_name', lastname: 'last_name', nom: 'last_name',
  email: 'email', mail: 'email', courriel: 'email', 'e-mail': 'email',
  phone: 'phone', telephone: 'phone', 'téléphone': 'phone', tel: 'phone',
  student_admission_number: 'student_admission_number', admission_number: 'student_admission_number',
  admission: 'student_admission_number', matricule: 'student_admission_number', eleve: 'student_admission_number', 'élève': 'student_admission_number',
  relationship: 'relationship', relation: 'relationship', lien: 'relationship', parente: 'relationship', 'parenté': 'relationship',
  status: 'status', statut: 'status',
}

// 'parent' is intentionally mapped to 'guardian': the parent_student_links CHECK
// constraint only allows father|mother|guardian|other (see migration 001), so
// 'guardian' is the inclusive default — matching the existing link UI.
const RELATIONSHIP_ALIASES: Record<string, 'father' | 'mother' | 'guardian' | 'other'> = {
  father: 'father', pere: 'father', 'père': 'father', papa: 'father',
  mother: 'mother', mere: 'mother', 'mère': 'mother', maman: 'mother',
  guardian: 'guardian', tuteur: 'guardian', tutrice: 'guardian', parent: 'guardian',
  other: 'other', autre: 'other',
}

export function normaliseRelationship(value: string): 'father' | 'mother' | 'guardian' | 'other' {
  const k = value.trim().toLowerCase()
  if (!k) return 'guardian'
  return RELATIONSHIP_ALIASES[k] ?? 'guardian'
}

/**
 * Map raw CSV/XLSX rows to parent rows with per-row validation. The first row is
 * treated as a header when it contains a recognised column name; otherwise the
 * columns are assumed to be first_name, last_name, email, phone,
 * student_admission_number, relationship, status in order. first_name/last_name
 * are required and at least one of phone/email; email is validated when present;
 * relationship is normalised (default guardian); status (active|inactive) is
 * validated when present. The student_admission_number's EXISTENCE is verified
 * separately (it needs the school's data) — here only its length is checked.
 */
export function readParentRows(grid: string[][]): ParsedParentRow[] {
  if (grid.length === 0) return []

  const header = grid[0].map((h) => h.trim().toLowerCase())
  const looksLikeHeader = header.some((h) => h in PARENT_HEADER_ALIASES)

  let firstIdx = 0, lastIdx = 1, emailIdx = 2, phoneIdx = 3, admIdx = 4, relIdx = 5, statusIdx = 6
  let dataStart = 0
  if (looksLikeHeader) {
    firstIdx  = header.findIndex((h) => PARENT_HEADER_ALIASES[h] === 'first_name')
    lastIdx   = header.findIndex((h) => PARENT_HEADER_ALIASES[h] === 'last_name')
    emailIdx  = header.findIndex((h) => PARENT_HEADER_ALIASES[h] === 'email')
    phoneIdx  = header.findIndex((h) => PARENT_HEADER_ALIASES[h] === 'phone')
    admIdx    = header.findIndex((h) => PARENT_HEADER_ALIASES[h] === 'student_admission_number')
    relIdx    = header.findIndex((h) => PARENT_HEADER_ALIASES[h] === 'relationship')
    statusIdx = header.findIndex((h) => PARENT_HEADER_ALIASES[h] === 'status')
    dataStart = 1
  }

  const cell = (cells: string[], i: number) => (i >= 0 ? cells[i] : '')?.trim() ?? ''

  const out: ParsedParentRow[] = []
  for (let r = dataStart; r < grid.length; r++) {
    const cells = grid[r]
    const first_name = cell(cells, firstIdx)
    const last_name  = cell(cells, lastIdx)
    const email      = cell(cells, emailIdx)
    const phone      = cell(cells, phoneIdx)
    const student_admission_number = cell(cells, admIdx)
    const relationship = normaliseRelationship(cell(cells, relIdx))
    const status     = cell(cells, statusIdx).toLowerCase()

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
  return out
}
