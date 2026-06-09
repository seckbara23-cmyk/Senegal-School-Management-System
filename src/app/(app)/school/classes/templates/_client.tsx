'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { CLASS_TEMPLATES } from '@/lib/class-templates'
import { createClassesFromTemplate, type TemplateState } from '../actions'

type YearOption = { id: string; label: string }

function SubmitButton({ disabled, count }: { disabled: boolean; count: number }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Création…' : count > 0 ? `Créer la structure (${count})` : 'Créer la structure'}
    </button>
  )
}

const initialState: TemplateState = {}

export function TemplatesClient({
  years, defaultYearId, existingByYear,
}: {
  years: YearOption[]
  defaultYearId: string
  existingByYear: Record<string, string[]>
}) {
  const [state, formAction] = useFormState(createClassesFromTemplate, initialState)
  const [yearId, setYearId] = useState(defaultYearId)
  const [templateKey, setTemplateKey] = useState(CLASS_TEMPLATES[0].key)

  const template = CLASS_TEMPLATES.find((t) => t.key === templateKey) ?? CLASS_TEMPLATES[0]
  const existing = new Set(existingByYear[yearId] ?? [])

  const preview = template.classes.map((c) => ({ ...c, exists: existing.has(c.name.toLowerCase()) }))
  const toCreate = preview.filter((c) => !c.exists).length
  const dupes = preview.length - toCreate

  return (
    <form action={formAction} className="space-y-6">
      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((m, i) => <p key={i} className="text-sm text-red-700">{m}</p>)}
        </div>
      )}

      {/* Year */}
      <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
        <label htmlFor="academic_year_id" className="block text-sm font-medium text-gray-700">Année scolaire</label>
        <select
          id="academic_year_id" name="academic_year_id" value={yearId}
          onChange={(e) => setYearId(e.target.value)}
          className="mt-1 block w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
        >
          {years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
        </select>
      </div>

      {/* Template choice */}
      <input type="hidden" name="template_key" value={templateKey} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CLASS_TEMPLATES.map((t) => {
          const active = t.key === templateKey
          return (
            <button
              type="button"
              key={t.key}
              onClick={() => setTemplateKey(t.key)}
              aria-pressed={active}
              className={`rounded-xl border p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${
                active ? 'border-primary-500 bg-primary-50 shadow-sm' : 'border-sand-200 bg-white hover:border-primary-300'
              }`}
            >
              <p className={`text-sm font-semibold ${active ? 'text-primary-800' : 'text-gray-900'}`}>{t.label}</p>
              <p className="mt-0.5 text-xs text-gray-500">{t.description}</p>
              <p className="mt-2 text-xs font-medium text-gray-400">{t.classes.length} classes</p>
            </button>
          )
        })}
      </div>

      {/* Preview */}
      <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-100 bg-sand-50 px-5 py-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-primary-700">Aperçu — {template.label}</h2>
          <span className="text-xs text-gray-500">
            <span className="font-semibold text-primary-700">{toCreate}</span> à créer
            {dupes > 0 && <> · <span className="font-semibold text-amber-600">{dupes}</span> déjà existante{dupes !== 1 ? 's' : ''}</>}
          </span>
        </div>
        <ul className="grid grid-cols-2 gap-px bg-sand-100 sm:grid-cols-3 lg:grid-cols-4">
          {preview.map((c) => (
            <li key={c.name} className="flex items-center justify-between gap-2 bg-white px-4 py-2.5">
              <span className={`truncate text-sm ${c.exists ? 'text-gray-400 line-through' : 'font-medium text-gray-900'}`}>{c.name}</span>
              {c.exists && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">déjà existante</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={toCreate === 0} count={toCreate} />
        {toCreate === 0 && <p className="text-sm text-gray-500">Toutes ces classes existent déjà pour cette année.</p>}
        <a href="/school/classes" className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</a>
      </div>
    </form>
  )
}
