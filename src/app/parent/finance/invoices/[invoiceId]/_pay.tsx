'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { initiatePayment, type PayState } from '../../actions'

const PROVIDER_LABEL: Record<string, string> = { wave: 'Wave', orange_money: 'Orange Money' }

function fmt(n: number) { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA' }

function PayButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
      {pending ? 'Redirection…' : 'Payer maintenant'}
    </button>
  )
}

export function PayPanel({ invoiceId, balance, providers, defaultAmount }: {
  invoiceId: string; balance: number; providers: string[]; defaultAmount: number
}) {
  const [state, formAction] = useFormState(initiatePayment, {} as PayState)
  const [amount, setAmount] = useState(String(defaultAmount))

  if (providers.length === 0) return null

  return (
    <section className="rounded-xl border border-emerald-200 bg-white shadow-sm">
      <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3"><h2 className="text-xs font-bold uppercase tracking-wider text-emerald-700">Payer en ligne</h2></div>
      <form action={formAction} className="space-y-4 px-5 py-4">
        <input type="hidden" name="invoice_id" value={invoiceId} />
        {state.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="provider" className="mb-1 block text-sm font-medium text-gray-700">Moyen de paiement</label>
            <select id="provider" name="provider" defaultValue={providers[0]} className="block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600">
              {providers.map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p] ?? p}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="amount" className="mb-1 block text-sm font-medium text-gray-700">Montant (max {fmt(balance)})</label>
            <input id="amount" name="amount" type="number" min={1} max={balance} step={1} value={amount} onChange={(e) => setAmount(e.target.value)}
              className="block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <PayButton />
          <p className="text-xs text-gray-400">Vous serez redirigé vers la page sécurisée de l’opérateur.</p>
        </div>
      </form>
    </section>
  )
}
