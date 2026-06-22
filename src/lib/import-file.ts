// ─── Import file reader (CSV + XLSX) ─────────────────────────────────────────
//
// Shared CLIENT helper for the bulk-import flows (students, classes, subjects).
// Turns a user-picked file into the SAME CSV text the existing pipeline already
// consumes, so preview, validation, duplicate handling and the authoritative
// server re-validation are all reused unchanged.
//
//   • .csv   → read as text (unchanged legacy behaviour)
//   • .xlsx  → parse the FIRST worksheet in the browser and serialise it to CSV
//   • anything else → a clear French error (no parsing attempted)
//
// SECURITY: XLSX is parsed ONLY in the browser, on a file the user chose. The
// server still receives plain CSV text and re-validates every value, so no
// binary/zip/xml parser ever runs server-side. SheetJS is loaded via a dynamic
// import so CSV-only users never download it. Guards below bound the input
// (size + row count) and reject spoofed/legacy/corrupt files by magic bytes.

export type ImportFileResult = { csvText: string } | { error: string }

// Bounds to keep a malicious/huge spreadsheet from exhausting memory.
const MAX_BYTES = 5 * 1024 * 1024          // 5 Mo
const MAX_ROWS  = 5000                       // worksheet rows (incl. header)

// ZIP local-file-header signature ("PK\x03\x04") — every .xlsx starts with it.
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]
// OLE2 compound-file signature — legacy .xls / .xlsb start with this.
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]

function ext(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? ''))
    r.onerror = () => reject(r.error ?? new Error('read_error'))
    r.readAsText(file)
  })
}

function readAsBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer))
    r.onerror = () => reject(r.error ?? new Error('read_error'))
    r.readAsArrayBuffer(file)
  })
}

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false
  for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false
  return true
}

/**
 * Read a picked CSV or XLSX file into CSV text, or return a French error message
 * for unsupported / oversized / corrupt files. Never throws.
 */
export async function readImportFile(file: File): Promise<ImportFileResult> {
  if (file.size > MAX_BYTES) {
    return { error: 'Fichier trop volumineux (5 Mo maximum).' }
  }

  const e = ext(file.name)

  // Explicitly reject the look-alike formats with a targeted message.
  if (e === '.xls' || e === '.xlsb') {
    return { error: 'Format Excel non pris en charge. Enregistrez le fichier au format .xlsx (Excel moderne).' }
  }
  if (e === '.xlsm') {
    return { error: 'Les fichiers Excel avec macros (.xlsm) ne sont pas pris en charge. Enregistrez au format .xlsx.' }
  }
  if (e === '.ods') {
    return { error: 'Les fichiers OpenDocument (.ods) ne sont pas pris en charge. Enregistrez au format .xlsx ou .csv.' }
  }

  // ── CSV: unchanged behaviour ────────────────────────────────────────────────
  if (e === '.csv' || file.type === 'text/csv') {
    try {
      return { csvText: await readAsText(file) }
    } catch {
      return { error: 'Le fichier CSV n’a pas pu être lu.' }
    }
  }

  // ── XLSX: parse the first worksheet in the browser ──────────────────────────
  if (e === '.xlsx') {
    let bytes: Uint8Array
    try {
      bytes = await readAsBytes(file)
    } catch {
      return { error: 'Le fichier Excel n’a pas pu être lu.' }
    }

    // Validate magic bytes, not the (spoofable) extension/MIME alone.
    if (startsWith(bytes, OLE2_MAGIC)) {
      return { error: 'Format Excel non pris en charge. Enregistrez le fichier au format .xlsx (Excel moderne).' }
    }
    if (!startsWith(bytes, ZIP_MAGIC)) {
      return { error: 'Fichier Excel illisible ou corrompu. Vérifiez le fichier et réessayez.' }
    }

    try {
      // Loaded on demand so CSV-only users never pay the bundle cost.
      const XLSX = await import('xlsx')

      // cellDates + dateNF make date cells serialise as AAAA-MM-JJ instead of
      // Excel serial numbers; otherwise values come through as formatted text.
      const wb = XLSX.read(bytes, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' })
      const sheetName = wb.SheetNames[0]
      if (!sheetName) {
        return { error: 'Le fichier Excel ne contient aucune feuille de calcul.' }
      }
      const sheet = wb.Sheets[sheetName]

      // Row-count guard against an oversized first sheet.
      const ref = sheet['!ref']
      if (ref) {
        const range = XLSX.utils.decode_range(ref)
        if (range.e.r - range.s.r + 1 > MAX_ROWS) {
          return { error: `Feuille trop volumineuse (${MAX_ROWS} lignes maximum).` }
        }
      }

      const csvText = XLSX.utils.sheet_to_csv(sheet, { FS: ',', blankrows: false, dateNF: 'yyyy-mm-dd' })
      if (!csvText.trim()) {
        return { error: 'La première feuille du fichier Excel est vide.' }
      }
      return { csvText }
    } catch {
      return { error: 'Fichier Excel illisible ou corrompu. Vérifiez le fichier et réessayez.' }
    }
  }

  return { error: 'Format non pris en charge. Importez un fichier .csv ou .xlsx.' }
}
