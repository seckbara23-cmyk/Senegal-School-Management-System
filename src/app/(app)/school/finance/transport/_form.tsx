'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { generateTransportInvoices, type TransportBillingState } from '../actions'

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending || disabled}
      className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">
      {pending ? 'Génération…' : 'Générer les factures'}
    </button>
  )
}

const field = 'block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'
const label = 'block text-sm font-medium text-gray-700 mb-1'

export function TransportBillingForm({ defaultTitle, today, disabled }: { defaultTitle: string; today: string; disabled: boolean }) {
  const [state, formAction] = useFormState(generateTransportInvoices, {} as TransportBillingState)
  return (
    <form action={formAction} className="space-y-4">
      {state.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</div>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="title">Intitulé de la facture</label>
          <input id="title" name="title" type="text" required maxLength={200} defaultValue={defaultTitle} className={field} />
          <p className="mt-1 text-xs text-gray-400">Sert aussi de garde anti-doublon : un élève déjà facturé sous cet intitulé est ignoré.</p>
        </div>
        <div>
          <label className={label} htmlFor="due_date">Échéance <span className="font-normal text-gray-400">(optionnel)</span></label>
          <input id="due_date" name="due_date" type="date" defaultValue={today} className={field} />
        </div>
      </div>
      <SubmitButton disabled={disabled} />
    </form>
  )
}
