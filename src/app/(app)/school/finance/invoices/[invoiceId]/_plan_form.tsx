'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createPaymentPlan, type PaymentPlanState } from '../../actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">
      {pending ? 'Création…' : 'Créer l’échéancier'}
    </button>
  )
}

const field = 'block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'
const label = 'block text-sm font-medium text-gray-700 mb-1'

export function PlanForm({ invoiceId, today }: { invoiceId: string; today: string }) {
  const [state, formAction] = useFormState(createPaymentPlan, {} as PaymentPlanState)
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      {state.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="installments">Nombre d’échéances</label>
          <select id="installments" name="installments" defaultValue="3" className={field}>
            {[2, 3, 4, 5, 6, 9, 10, 12].map((n) => <option key={n} value={n}>{n} fois</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="interval_months">Fréquence</label>
          <select id="interval_months" name="interval_months" defaultValue="1" className={field}>
            <option value="1">Mensuelle</option>
            <option value="2">Tous les 2 mois</option>
            <option value="3">Trimestrielle</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="start_date">Première échéance</label>
          <input id="start_date" name="start_date" type="date" defaultValue={today} required className={field} />
        </div>
      </div>

      <p className="text-xs text-gray-400">Le montant total de la facture est réparti en parts égales (la dernière échéance absorbe l’arrondi). La facture reste inchangée.</p>
      <SubmitButton />
    </form>
  )
}
