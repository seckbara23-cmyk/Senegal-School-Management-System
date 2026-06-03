'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createSubscriptionInvoice, type CreateInvoiceState } from '../actions'

function inputClass(hasError: boolean): string {
  return (
    'mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ' +
    (hasError
      ? 'border-red-400 text-red-900 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 text-gray-900 focus:border-indigo-500 focus:ring-indigo-500')
  )
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) return null
  return <p className="mt-1 text-xs text-red-600">{errors[0]}</p>
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Création…' : 'Créer la facture'}
    </button>
  )
}

const initialState: CreateInvoiceState = {}

export function CreateInvoiceForm({ schoolId, suggestedAmount }: { schoolId: string; suggestedAmount: number | null }) {
  const [state, formAction] = useFormState(createSubscriptionInvoice, initialState)

  return (
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="school_id" value={schoolId} />

      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((m, i) => <p key={i} className="text-sm text-red-700">{m}</p>)}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700">Montant (XOF)</label>
          <input
            id="amount" name="amount" type="number" min="0" step="1" required
            defaultValue={suggestedAmount ?? ''}
            className={inputClass(!!state.errors?.amount)}
          />
          <FieldError errors={state.errors?.amount} />
          {suggestedAmount !== null && (
            <p className="mt-1 text-xs text-gray-400">Pré-rempli avec le tarif mensuel de la formule (modifiable).</p>
          )}
        </div>
        <div>
          <label htmlFor="due_date" className="block text-sm font-medium text-gray-700">Échéance <span className="font-normal text-gray-400">(optionnel)</span></label>
          <input id="due_date" name="due_date" type="date" className={inputClass(!!state.errors?.due_date)} />
          <FieldError errors={state.errors?.due_date} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="billing_period_start" className="block text-sm font-medium text-gray-700">Début de période <span className="font-normal text-gray-400">(optionnel)</span></label>
          <input id="billing_period_start" name="billing_period_start" type="date" className={inputClass(!!state.errors?.billing_period_start)} />
          <FieldError errors={state.errors?.billing_period_start} />
        </div>
        <div>
          <label htmlFor="billing_period_end" className="block text-sm font-medium text-gray-700">Fin de période <span className="font-normal text-gray-400">(optionnel)</span></label>
          <input id="billing_period_end" name="billing_period_end" type="date" className={inputClass(!!state.errors?.billing_period_end)} />
          <FieldError errors={state.errors?.billing_period_end} />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notes <span className="font-normal text-gray-400">(optionnel)</span></label>
        <input id="notes" name="notes" type="text" maxLength={500} className={inputClass(!!state.errors?.notes)} />
        <FieldError errors={state.errors?.notes} />
      </div>

      <SubmitButton />
    </form>
  )
}
