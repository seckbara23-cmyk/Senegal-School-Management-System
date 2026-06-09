'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { SUBJECT_TEMPLATES } from '@/lib/subject-templates'
import { createSubjectsFromTemplate, type SubjectTemplateState } from '../../actions'

function SubmitButton({ disabled, count }: { disabled: boolean; count: number }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Création…' : count > 0 ? `Créer les matières (${count})` : 'Créer les matières'}
    </button>
  )
}

const initialState: SubjectTemplateState = {}

export function SubjectTemplatesClient({ existing }: { existing: string[] }) {
  const [state, formAction] = useFormState(createSubjectsFromTemplate, initialState)
  const [templateKey, setTemplateKey] = useState(SUBJECT_TEMPLATES[0].key)

  const template = SUBJECT_TEMPLATES.find((t) => t.key === templateKey) ?? SUBJECT_TEMPLATES[0]
  const have = new Set(existing)

  const seen = new Set<string>()
  const preview = template.subjects.map((s) => {
    const key = s.name.toLowerCase()
    let status: 'create' | 'exists' | 'duplicate' = 'create'
    if (have.has(key)) status = 'exists'
    else if (seen.has(key)) status = 'duplicate'
    else seen.add(key)
    return { ...s, status }
  })
  const toCreate = preview.filter((p) => p.status === 'create').length
  const dupes = preview.length - toCreate

  return (
    <form action={formAction} className="space-y-6">
      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((m, i) => <p key={i} className="text-sm text-red-700">{m}</p>)}
        </div>
      )}

      <input type="hidden" name="template_key" value={templateKey} />

      {/* Template choice */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SUBJECT_TEMPLATES.map((t) => {
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
              <p className="mt-2 text-xs font-medium text-gray-400">{t.subjects.length} matières</p>
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
        <ul className="divide-y divide-sand-100">
          {preview.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <div className="min-w-0">
                <span className={`text-sm ${p.status === 'create' ? 'font-medium text-gray-900' : 'text-gray-400 line-through'}`}>{p.name}</span>
                <span className="ml-2 font-mono text-xs text-gray-400">{p.code}</span>
                <span className="ml-2 text-xs text-gray-400">coeff. {p.coefficient}</span>
              </div>
              {p.status === 'exists' && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">déjà existante</span>}
              {p.status === 'duplicate' && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">doublon</span>}
              {p.status === 'create' && <span className="shrink-0 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700">à créer</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={toCreate === 0} count={toCreate} />
        {toCreate === 0 && <p className="text-sm text-gray-500">Toutes ces matières existent déjà.</p>}
        <a href="/school/academics/subjects" className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</a>
      </div>
    </form>
  )
}
