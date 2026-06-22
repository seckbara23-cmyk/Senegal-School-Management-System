'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { recordPayment, type PaymentState } from '../../actions'

const DEFAULT_METHODS = [
  { value: 'cash',                 label: 'Espèces' },
  { value: 'wave_manual',          label: 'Wave' },
  { value: 'orange_money_manual',  label: 'Orange Money' },
  { value: 'bank_transfer',        label: 'Virement bancaire' },
  { value: 'cheque',               label: 'Chèque' },
  { value: 'other',                label: 'Autre' },
]

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
    >
      {pending ? 'Enregistrement…' : 'Enregistrer le paiement'}
    </button>
  )
}

const initialState: PaymentState = {}

export function PaymentForm({ invoiceId, balance, methods }: { invoiceId: string; balance: number; methods?: { value: string; label: string }[] }) {
  const [state, formAction] = useFormState(recordPayment, initialState)
  const paymentMethods = methods && methods.length > 0 ? methods : DEFAULT_METHODS

  const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'

  return (
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="invoice_id" value={invoiceId} />

      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((msg, i) => (
            <p key={i} className="text-sm text-red-700">{msg}</p>
          ))}
        </div>
      )}

      {/* Amount */}
      <div>
        <label htmlFor="pay_amount" className="block text-sm font-medium text-gray-700 mb-1">
          Montant encaissé (FCFA) <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input
            id="pay_amount"
            name="amount"
            type="number"
            min="1"
            step="1"
            defaultValue={balance > 0 ? balance : ''}
            placeholder="0"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 pr-16 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-400">
            FCFA
          </span>
        </div>
        {balance > 0 && (
          <p className="mt-1 text-xs text-gray-500">Solde restant : {fmt(balance)}</p>
        )}
        {state.errors?.amount && (
          <p className="mt-1 text-xs text-red-600">{state.errors.amount[0]}</p>
        )}
      </div>

      {/* Payment method */}
      <div>
        <label htmlFor="payment_method" className="block text-sm font-medium text-gray-700 mb-1">
          Mode de paiement <span className="text-red-500">*</span>
        </label>
        <select
          id="payment_method"
          name="payment_method"
          defaultValue="cash"
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
        >
          {paymentMethods.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        {state.errors?.payment_method && (
          <p className="mt-1 text-xs text-red-600">{state.errors.payment_method[0]}</p>
        )}
      </div>

      {/* Reference */}
      <div>
        <label htmlFor="reference" className="block text-sm font-medium text-gray-700 mb-1">
          Référence <span className="font-normal text-gray-400">(optionnel)</span>
        </label>
        <input
          id="reference"
          name="reference"
          type="text"
          placeholder="N° reçu, N° transaction…"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        {state.errors?.reference && (
          <p className="mt-1 text-xs text-red-600">{state.errors.reference[0]}</p>
        )}
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="pay_notes" className="block text-sm font-medium text-gray-700 mb-1">
          Notes <span className="font-normal text-gray-400">(optionnel)</span>
        </label>
        <textarea
          id="pay_notes"
          name="notes"
          rows={2}
          placeholder="Observations…"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
      </div>

      <SubmitButton />
    </form>
  )
}
