'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { convertAdmission, type ConvertState } from '../actions'

export type ClassOpt = { id: string; label: string }
export type FeeOpt = { id: string; name: string; amount: number }

function fmt(n: number) { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA' }

function inputClass(hasError: boolean): string {
  return 'mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ' +
    (hasError ? 'border-red-400 text-red-900 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 text-gray-900 focus:border-primary-600 focus:ring-primary-600')
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="inline-flex justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
      {pending ? 'Conversion…' : 'Convertir en élève'}
    </button>
  )
}

const initialState: ConvertState = {}

export function ConvertForm({ admissionId, defaultClassId, classes, guardianName, feeItems }: {
  admissionId: string; defaultClassId: string | null; classes: ClassOpt[]; guardianName: string | null; feeItems: FeeOpt[]
}) {
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

      {/* Parent */}
      <label className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${guardianName ? 'border-sand-200 bg-white cursor-pointer' : 'border-sand-200 bg-sand-50'}`}>
        <input type="checkbox" name="create_parent" defaultChecked={!!guardianName} disabled={!guardianName} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600" />
        <span>
          <span className="block text-sm font-medium text-gray-800">Créer le compte parent et le rattacher</span>
          <span className="block text-xs text-gray-400">{guardianName ? `À partir de « ${guardianName} ».` : 'Aucun parent renseigné dans la candidature.'}</span>
        </span>
      </label>

      {/* Optional invoice */}
      {feeItems.length > 0 && (
        <div className="rounded-lg border border-sand-200 bg-sand-50 px-4 py-3">
          <p className="text-sm font-medium text-gray-700">Facture d’inscription <span className="font-normal text-gray-400">(optionnel)</span></p>
          <div className="mt-2 space-y-1.5">
            {feeItems.map((f) => (
              <label key={f.id} className="flex items-center gap-3 rounded-md bg-white px-3 py-2 cursor-pointer hover:bg-sand-100">
                <input type="checkbox" name="fee_item_ids" value={f.id} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600" />
                <span className="flex-1 text-sm text-gray-800">{f.name}</span>
                <span className="text-sm font-semibold text-gray-600">{fmt(f.amount)}</span>
              </label>
            ))}
          </div>
          <div className="mt-3">
            <label htmlFor="invoice_due_date" className="block text-xs font-medium text-gray-600">Échéance</label>
            <input id="invoice_due_date" name="invoice_due_date" type="date" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600 sm:max-w-xs" />
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">Crée le dossier élève, le parent (si coché) et, si une classe est choisie, l’inscription. La candidature est conservée pour l’historique.</p>
      <SubmitButton />
    </form>
  )
}
