// Shared document-management constants & helpers (server-only usage).
//
// The security model lives in the server actions: a PRIVATE bucket + service-
// role file ops gated by an app-layer school_admin check + admin-only metadata
// RLS. This module just centralises the shared constants and small helpers.

export const DOCUMENTS_BUCKET = 'school-documents'

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024 // 10 MB

export const ALLOWED_DOCUMENT_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export type OwnerType = 'student' | 'teacher' | 'admission'

// Document categories offered in the upload form (value → French label).
export const DOCUMENT_TYPES: { value: string; label: string }[] = [
  { value: 'birth_certificate', label: 'Acte de naissance' },
  { value: 'report_card',       label: 'Bulletin / relevé' },
  { value: 'id_document',       label: "Pièce d'identité" },
  { value: 'medical',           label: 'Certificat médical' },
  { value: 'photo',             label: 'Photo' },
  { value: 'diploma',           label: 'Diplôme / attestation' },
  { value: 'other',             label: 'Autre' },
]

const DOCUMENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  DOCUMENT_TYPES.map((t) => [t.value, t.label]),
)

export function documentTypeLabel(value: string): string {
  return DOCUMENT_TYPE_LABELS[value] ?? value
}

export function isAllowedMime(mime: string): boolean {
  return (ALLOWED_DOCUMENT_MIME as readonly string[]).includes(mime)
}

// Sanitise an uploaded filename for safe use inside a storage path.
export function safeFilename(name: string): string {
  const cleaned = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip accents
    .replace(/[^A-Za-z0-9._-]+/g, '_')                  // collapse unsafe chars
    .replace(/^[._]+/, '')                              // no leading dot/underscore
    .slice(0, 120)
  return cleaned || 'document'
}

export function humanSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}
