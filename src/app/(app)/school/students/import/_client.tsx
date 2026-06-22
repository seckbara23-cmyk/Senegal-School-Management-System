'use client'

import { useMemo, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { parseCsv, readStudentRows } from '@/lib/parse-csv'
import { readImportFile } from '@/lib/import-file'
import { importStudentsFromCsv, type ImportStudentsState } from '../actions'

type ClassOption = { id: string; label: string }

const TEMPLATE_CSV =
  'first_name,last_name,admission_number,gender,date_of_birth,status\n' +
  'Aminata,Diallo,2025-001,female,2014-03-12,active\n' +
  'Moussa,Ndiaye,2025-002,male,,active\n'

type PreviewRow = {
  line: number
  first_name: string
  last_name: string
  admission_number: string
  status: 'create' | 'duplicate_file' | 'exists' | 'error'
  message: string | null
}

const STATUS_BADGE: Record<PreviewRow['status'], { label: string; cls: string }> = {
  create:         { label: 'à créer',        cls: 'bg-primary-100 text-primary-700' },
  exists:         { label: 'déjà existant',  cls: 'bg-amber-100 text-amber-700' },
  duplicate_file: { label: 'doublon',        cls: 'bg-amber-100 text-amber-700' },
  error:          { label: 'erreur',         cls: 'bg-red-100 text-red-700' },
}

function SubmitButton({ disabled, count }: { disabled: boolean; count: number }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Import…' : count > 0 ? `Importer (${count})` : 'Importer'}
    </button>
  )
}

const initialState: ImportStudentsState = {}

export function ImportStudentsClient({ existing, classes }: { existing: string[]; classes: ClassOption[] }) {
  const [state, formAction] = useFormState(importStudentsFromCsv, initialState)
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const have = useMemo(() => new Set(existing), [existing])

  const preview = useMemo(() => {
    if (!csvText.trim()) return { rows: [] as PreviewRow[], notes: [] as string[] }
    const { rows: parsed, notes } = readStudentRows(parseCsv(csvText))
    const seenInFile = new Set<string>()
    const rows = parsed.map((r): PreviewRow => {
      const base = { line: r.line, first_name: r.first_name, last_name: r.last_name, admission_number: r.admission_number }
      if (r.error) return { ...base, status: 'error' as const, message: r.error }
      const key = r.admission_number.toLowerCase()
      if (have.has(key)) return { ...base, status: 'exists' as const, message: null }
      if (seenInFile.has(key)) return { ...base, status: 'duplicate_file' as const, message: 'Doublon dans le fichier' }
      seenInFile.add(key)
      return { ...base, status: 'create' as const, message: null }
    })
    return { rows, notes }
  }, [csvText, have])
  const rows = preview.rows
  const cleanupNotes = preview.notes

  const errorCount  = rows.filter((r) => r.status === 'error').length
  const createCount = rows.filter((r) => r.status === 'create').length
  const skipCount   = rows.filter((r) => r.status === 'exists' || r.status === 'duplicate_file').length

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    setFileError(null)
    const result = await readImportFile(f)
    if ('error' in result) { setCsvText(''); setFileError(result.error); return }
    setCsvText(result.csvText)
  }

  function downloadTemplate() {
    const blob = new Blob(['﻿' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modele-eleves.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="csv_text" value={csvText} />

      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((m, i) => <p key={i} className="text-sm text-red-700">{m}</p>)}
          {state.rowErrors && state.rowErrors.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {state.rowErrors.map((e, i) => <li key={i} className="text-xs text-red-600">{e.message}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Step 1: template + file + optional class */}
      <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-sand-50 transition-colors">
            Télécharger le modèle CSV
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100 transition-colors">
            Choisir un fichier
            <input ref={fileRef} type="file" accept=".csv,.xlsx" onChange={onFile} className="sr-only" />
          </label>
          {fileName && <span className="text-sm text-gray-500">{fileName}</span>}
        </div>

        {fileError && (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{fileError}</div>
        )}

        {classes.length > 0 && (
          <div>
            <label htmlFor="class_id" className="block text-xs font-medium text-gray-600 mb-1">Inscrire dans une classe (optionnel)</label>
            <select id="class_id" name="class_id" defaultValue="" className="block w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600">
              <option value="">— Aucune (ne pas inscrire) —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        )}

        <p className="text-xs text-gray-400">
          Colonnes : <span className="font-mono">first_name, last_name, admission_number, gender, date_of_birth, status</span>.
          Prénom, nom et numéro d&apos;admission obligatoires.
        </p>
      </div>

      {/* Cleanup transparency */}
      {cleanupNotes.length > 0 && (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
          <ul className="space-y-0.5">
            {cleanupNotes.map((n, i) => <li key={i}>✨ {n}</li>)}
          </ul>
        </div>
      )}

      {/* Step 2: preview */}
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-100 bg-sand-50 px-5 py-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-primary-700">Aperçu ({rows.length} ligne{rows.length !== 1 ? 's' : ''})</h2>
            <span className="text-xs text-gray-500">
              <span className="font-semibold text-primary-700">{createCount}</span> à créer
              {skipCount > 0 && <> · <span className="font-semibold text-amber-600">{skipCount}</span> ignoré{skipCount !== 1 ? 's' : ''}</>}
              {errorCount > 0 && <> · <span className="font-semibold text-red-600">{errorCount}</span> erreur{errorCount !== 1 ? 's' : ''}</>}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-100 text-left">
                  <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Nom</th>
                  <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">N° adm.</th>
                  <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const badge = STATUS_BADGE[r.status]
                  return (
                    <tr key={`${r.line}-${idx}`} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                      <td className="px-4 py-2.5 text-gray-900">
                        {(r.last_name || r.first_name) ? `${r.last_name} ${r.first_name}`.trim() : <span className="italic text-gray-400">(vide)</span>}
                        {r.message && <span className="ml-2 text-xs text-red-600">{r.message}</span>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{r.admission_number || '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {errorCount > 0 && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Corrigez les {errorCount} ligne{errorCount !== 1 ? 's' : ''} en erreur avant d&apos;importer. Aucun élève ne sera importé tant qu&apos;il reste des erreurs.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={createCount === 0 || errorCount > 0} count={createCount} />
        <a href="/school/students" className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</a>
      </div>
    </form>
  )
}
