'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { convertAdmission, type ConvertState } from '../actions'

export type ClassOpt = { id: string; label: string }

function inputClass(hasError: boolean): string {
  return 'mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ' +
    (hasError ? 'border-red-400 text-red-900 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 text-gray-900 focus:border-primary-600 focus:ring-primary-600')
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
    >
      {pending ? 'Conversion…' : "Convertir en élève"}
    </button>
  )
}

const initialState: ConvertState = {}

export function ConvertForm({ admissionId, defaultClassId, classes }: { admissionId: string; defaultClassId: string | null; classes: ClassOpt[] }) {
  const [state, formAction] = useFormState(convertAdmission, initialState)

  return (
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="admission_id" value={admissionId} />

      {state.errors?._form && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((m, i) => <p key={i} className="text-sm text-red-700">{m}</p>)}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="admission_number" className="block text-sm font-medium text-gray-700">Matricule <span className="text-red-500">*</span></label>
          <input id="admission_number" name="admission_number" type="text" required placeholder="ex. 2026-0142" className={inputClass(!!state.errors?.admission_number)} />
          {state.errors?.admission_number && <p className="mt-1 text-xs text-red-600">{state.errors.admission_number[0]}</p>}
        </div>
        <div>
          <label htmlFor="class_id" className="block text-sm font-medium text-gray-700">Inscrire dans la classe <span className="font-normal text-gray-400">(optionnel)</span></label>
          <select id="class_id" name="class_id" defaultValue={defaultClassId ?? ''} className={inputClass(!!state.errors?.class_id)}>
            <option value="">— Ne pas inscrire —</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {state.errors?.class_id && <p className="mt-1 text-xs text-red-600">{state.errors.class_id[0]}</p>}
        </div>
      </div>

      <p className="text-xs text-gray-400">Crée un dossier élève à partir de la candidature et, si une classe est choisie, l&apos;y inscrit pour l&apos;année correspondante.</p>

      <SubmitButton />
    </form>
  )
}
