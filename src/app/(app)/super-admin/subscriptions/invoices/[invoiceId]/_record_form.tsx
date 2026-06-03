'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { recordSubscriptionPayment, type RecordPaymentState } from '../../actions'

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
      {pending ? 'Enregistrement…' : 'Enregistrer le paiement'}
    </button>
  )
}

const METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: 'manual',        label: 'Manuel' },
  { value: 'bank_transfer', label: 'Virement bancaire' },
  { value: 'wave',          label: 'Wave' },
  { value: 'orange_money',  label: 'Orange Money' },
  { value: 'card',          label: 'Carte' },
]

const initialState: RecordPaymentState = {}

export function RecordPaymentForm({ invoiceId, remaining }: { invoiceId: string; remaining: number }) {
  const [state, formAction] = useFormState(recordSubscriptionPayment, initialState)

  return (
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="invoice_id" value={invoiceId} />

      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((m, i) => <p key={i} className="text-sm text-red-700">{m}</p>)}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700">Montant (XOF)</label>
          <input
            id="amount" name="amount" type="number" min="1" step="1" required
            defaultValue={remaining > 0 ? remaining : ''}
            className={inputClass(!!state.errors?.amount)}
          />
          <FieldError errors={state.errors?.amount} />
          <p className="mt-1 text-xs text-gray-400">Solde restant : {new Intl.NumberFormat('fr-FR').format(remaining)} XOF.</p>
        </div>
        <div>
          <label htmlFor="method" className="block text-sm font-medium text-gray-700">Mode</label>
          <select id="method" name="method" defaultValue="manual" className={inputClass(!!state.errors?.method)}>
            {METHOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <FieldError errors={state.errors?.method} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="reference" className="block text-sm font-medium text-gray-700">Référence <span className="font-normal text-gray-400">(optionnel)</span></label>
          <input id="reference" name="reference" type="text" className={inputClass(!!state.errors?.reference)} />
          <FieldError errors={state.errors?.reference} />
        </div>
        <div>
          <label htmlFor="paid_at" className="block text-sm font-medium text-gray-700">Date <span className="font-normal text-gray-400">(optionnel)</span></label>
          <input id="paid_at" name="paid_at" type="date" className={inputClass(!!state.errors?.paid_at)} />
          <FieldError errors={state.errors?.paid_at} />
        </div>
      </div>

      <SubmitButton />
    </form>
  )
}
