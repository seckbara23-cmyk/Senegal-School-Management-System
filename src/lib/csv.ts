import { NextResponse } from 'next/server'

// ─── CSV utilities ───────────────────────────────────────────────────────────
//
// Safe CSV generation for finance exports. Handles RFC-4180 quoting AND
// spreadsheet formula-injection: any value starting with = + - @ (or a control
// char) is prefixed with a single quote so Excel/Sheets treats it as text, not
// a formula. Output is UTF-8 (BOM added by csvResponse) with CRLF line endings.

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  // Formula-injection guard (OWASP): neutralise leading dangerous characters.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  // RFC-4180 quoting when the value contains a comma, quote, or newline.
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(',')]
  for (const row of rows) lines.push(row.map(csvEscape).join(','))
  return lines.join('\r\n')
}

// Build a downloadable CSV response. Prepends a UTF-8 BOM so Excel renders
// accented characters correctly.
export function csvResponse(filename: string, csv: string): NextResponse {
  return new NextResponse('﻿' + csv, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}

// Sanitise a slug-ish token for use inside a filename.
export function fileToken(s: string | null | undefined): string {
  const t = (s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return t || 'ecole'
}

// Sanitise a user search term before embedding it in a PostgREST .or() filter,
// stripping characters that would break the comma/paren-delimited filter syntax.
export function sanitizeOrTerm(q: string): string {
  return q.replace(/[,()*]/g, '').trim().slice(0, 100)
}
