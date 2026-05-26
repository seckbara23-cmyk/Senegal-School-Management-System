'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { cancelInvoice, type CancelInvoiceState } from '../../actions'

const initialState: CancelInvoiceState = {}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
    >
      {pending ? 'Annulation…' : "Confirmer l'annulation"}
    </button>
  )
}

type Props = {
  invoiceId: string
}

export function CancelInvoiceForm({ invoiceId }: Props) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useFormState(cancelInvoice, initialState)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-red-600 hover:text-red-800 hover:underline"
      >
        Annuler la facture
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-5">
      <p className="text-sm font-semibold text-red-800 mb-1">Annuler cette facture</p>
      <p className="text-xs text-red-700 mb-4">
        Cette action est irréversible. La facture sera archivée avec le statut « Annulée ».
        Aucun paiement ne pourra être enregistré par la suite.
      </p>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="invoice_id" value={invoiceId} />
        {state.errors?._form && state.errors._form.length > 0 && (
          <div role="alert" className="rounded-md border border-red-300 bg-red-100 px-3 py-2">
            {state.errors._form.map((msg, i) => (
              <p key={i} className="text-xs text-red-700">{msg}</p>
            ))}
          </div>
        )}
        <div>
          <label htmlFor="cancellation_reason" className="block text-xs font-medium text-red-800 mb-1">
            Motif d&apos;annulation <span className="text-red-600">*</span>
          </label>
          <textarea
            id="cancellation_reason"
            name="cancellation_reason"
            rows={3}
            maxLength={500}
            placeholder="Indiquez la raison de l'annulation…"
            className="block w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          {state.errors?.cancellation_reason && (
            <p className="mt-1 text-xs text-red-600">{state.errors.cancellation_reason[0]}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-gray-500 hover:text-gray-800 hover:underline"
          >
            Conserver la facture
          </button>
        </div>
      </form>
    </div>
  )
}
