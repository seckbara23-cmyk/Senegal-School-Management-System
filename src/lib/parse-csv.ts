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
