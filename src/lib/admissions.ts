// ─── Admissions helpers (server-only) ────────────────────────────────────────
//
// Shared by the internal admissions actions and the public service-role API
// routes. Imports node 'crypto' → never import this from a client component.

import { randomBytes } from 'crypto'

export const ADMISSION_STATUS_LABEL: Record<string, string> = {
  draft:               'Brouillon',
  submitted:           'Soumise',
  under_review:        'En revue',
  documents_requested: 'Pièces demandées',
  accepted:            'Acceptée',
  rejected:            'Refusée',
  waitlisted:          'Liste d’attente',
  withdrawn:           'Retirée',
}

export const ADMISSION_STATUS_CLASS: Record<string, string> = {
  draft:               'border-gray-200 bg-gray-100 text-gray-500',
  submitted:           'border-sky-200 bg-sky-50 text-sky-700',
  under_review:        'border-primary-200 bg-primary-50 text-primary-700',
  documents_requested: 'border-amber-200 bg-amber-50 text-amber-700',
  accepted:            'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected:            'border-red-200 bg-red-50 text-red-700',
  waitlisted:          'border-indigo-200 bg-indigo-50 text-indigo-700',
  withdrawn:           'border-gray-200 bg-gray-100 text-gray-500',
}

// Document types collected during a public application.
export const ADMISSION_DOC_TYPES = [
  { value: 'birth_certificate', label: 'Acte de naissance' },
  { value: 'report_card',       label: 'Bulletin précédent' },
  { value: 'id_document',       label: 'Pièce d’identité' },
  { value: 'photo',             label: 'Photo' },
  { value: 'other',             label: 'Autre' },
] as const

// URL-safe slug from a school name (a–z, 0–9, single hyphens).
export function slugify(input: string): string {
  return input
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// Long random secret used by families to track + upload to their application.
export function generateApplicationToken(): string {
  return randomBytes(24).toString('hex') // 48 hex chars
}

// Human reference, unique per school: APP-YYYY-NNNNNN.
export function buildReferenceCode(year: number, sequence: number): string {
  return `APP-${year}-${String(sequence).padStart(6, '0')}`
}
