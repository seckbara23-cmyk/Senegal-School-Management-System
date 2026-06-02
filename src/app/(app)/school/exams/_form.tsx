'use client'

import { useFormState, useFormStatus } from 'react-dom'
import type { ExamSessionState } from './actions'

export type AcademicYearOption = { id: string; label: string }
export type ExamSessionInitial = {
  academic_year_id: string
  name:             string
  description:      string | null
  starts_on:        string
  ends_on:          string
}

function inputClass(hasError: boolean): string {
  return 'mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ' +
    (hasError ? 'border-red-400 text-red-900 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 text-gray-900 focus:border-primary-600 focus:ring-primary-600')
}
function FieldError({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) return null
  return <p className="mt-1 text-xs text-red-600">{errors[0]}</p>
}

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
    >
      {pending ? 'Enregistrement…' : editing ? 'Enregistrer les modifications' : 'Créer la session'}
    </button>
  )
}

type Props = {
  action:        (state: ExamSessionState, formData: FormData) => Promise<ExamSessionState>
  academicYears: AcademicYearOption[]
  initial?:      ExamSessionInitial
  sessionId?:    string
  cancelHref:    string
}

export function ExamSessionForm({ action, academicYears, initial, sessionId, cancelHref }: Props) {
  const [state, formAction] = useFormState(action, {})

  return (
    <form action={formAction} noValidate className="space-y-5">
      {sessionId && <input type="hidden" name="session_id" value={sessionId} />}

      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((m, i) => <p key={i} className="text-sm text-red-700">{m}</p>)}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nom de la session <span className="text-red-500">*</span></label>
        <input id="name" name="name" type="text" required defaultValue={initial?.name ?? ''} placeholder="ex. Composition du 1er trimestre" className={inputClass(!!state.errors?.name)} />
        <FieldError errors={state.errors?.name} />
      </div>

      <div>
        <label htmlFor="academic_year_id" className="block text-sm font-medium text-gray-700">Année scolaire <span className="text-red-500">*</span></label>
        <select id="academic_year_id" name="academic_year_id" required defaultValue={initial?.academic_year_id ?? (academicYears[0]?.id ?? '')} className={inputClass(!!state.errors?.academic_year_id)}>
          {academicYears.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
        </select>
        <FieldError errors={state.errors?.academic_year_id} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="starts_on" className="block text-sm font-medium text-gray-700">Début <span className="text-red-500">*</span></label>
          <input id="starts_on" name="starts_on" type="date" required defaultValue={initial?.starts_on ?? ''} className={inputClass(!!state.errors?.starts_on)} />
          <FieldError errors={state.errors?.starts_on} />
        </div>
        <div>
          <label htmlFor="ends_on" className="block text-sm font-medium text-gray-700">Fin <span className="text-red-500">*</span></label>
          <input id="ends_on" name="ends_on" type="date" required defaultValue={initial?.ends_on ?? ''} className={inputClass(!!state.errors?.ends_on)} />
          <FieldError errors={state.errors?.ends_on} />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description <span className="font-normal text-gray-400">(optionnel)</span></label>
        <textarea id="description" name="description" rows={3} defaultValue={initial?.description ?? ''} className={inputClass(!!state.errors?.description)} />
        <FieldError errors={state.errors?.description} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-sand-100 pt-4">
        <SubmitButton editing={!!sessionId} />
        <a href={cancelHref} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</a>
      </div>
    </form>
  )
}
