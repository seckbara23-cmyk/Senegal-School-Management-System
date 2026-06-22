'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { invoiceFamily, type FamilyInvoiceState } from '../../actions'

function fmt(n: number) { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA' }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">
      {pending ? 'Facturation…' : 'Facturer la famille'}
    </button>
  )
}

const field = 'block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'

export function FamilyInvoiceForm({ parentId, feeItems, today, childCount }: {
  parentId: string; feeItems: { id: string; name: string; amount: number }[]; today: string; childCount: number
}) {
  const [state, formAction] = useFormState(invoiceFamily, {} as FamilyInvoiceState)
  if (feeItems.length === 0) {
    return <p className="text-sm text-gray-500">Aucun frais au catalogue. <a href="/school/finance/fees/new" className="text-primary-600 hover:underline">Créer un frais</a>.</p>
  }
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="parent_id" value={parentId} />
      {state.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="title">Intitulé</label>
          <input id="title" name="title" type="text" required maxLength={200} placeholder="Frais de scolarité T2…" className={field} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="due_date">Échéance <span className="font-normal text-gray-400">(optionnel)</span></label>
          <input id="due_date" name="due_date" type="date" defaultValue={today} className={field} />
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Frais à appliquer à chaque enfant</p>
        <div className="space-y-1.5">
          {feeItems.map((f) => (
            <label key={f.id} className="flex items-center gap-3 rounded-lg border border-sand-200 bg-white px-4 py-2.5 cursor-pointer hover:bg-sand-50">
              <input type="checkbox" name="fee_item_ids" value={f.id} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600" />
              <span className="flex-1 text-sm text-gray-800">{f.name}</span>
              <span className="text-sm font-semibold text-gray-600">{fmt(f.amount)}</span>
            </label>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400">Une facture distincte est créée pour chacun des {childCount} enfant{childCount !== 1 ? 's' : ''}. Les enfants déjà facturés sous cet intitulé sont ignorés.</p>
      <SubmitButton />
    </form>
  )
}
