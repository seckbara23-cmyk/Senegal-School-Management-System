'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createBulkInvoices, type BulkInvoiceState } from '../../actions'

export type FeeItemOption = {
  id: string
  name: string
  amount: number
  description: string | null
}

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
}

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || count === 0}
      className="inline-flex justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
    >
      {pending
        ? 'Création en cours…'
        : count === 0
        ? 'Aucun élève inscrit'
        : `Créer ${count} facture${count !== 1 ? 's' : ''}`}
    </button>
  )
}

const initialState: BulkInvoiceState = {}

type Props = {
  classId:         string
  className:       string
  academicYearName: string
  enrolledCount:   number
  feeItems:        FeeItemOption[]
  defaultTitle:    string
}

export function BulkInvoiceForm({
  classId,
  className,
  academicYearName,
  enrolledCount,
  feeItems,
  defaultTitle,
}: Props) {
  const [state, formAction] = useFormState(createBulkInvoices, initialState)
  const [selectedFeeIds, setSelectedFeeIds] = useState<Set<string>>(new Set())
  const [customAmount, setCustomAmount]     = useState('')

  function toggleFee(id: string) {
    setSelectedFeeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const feeTotal   = feeItems.filter((f) => selectedFeeIds.has(f.id)).reduce((s, f) => s + f.amount, 0)
  const customVal  = parseInt(customAmount, 10)
  const customCalc = isNaN(customVal) || customVal <= 0 ? 0 : customVal
  const perStudent = feeTotal + customCalc
  const grandTotal = perStudent * enrolledCount

  return (
    <form action={formAction} noValidate className="space-y-6">
      <input type="hidden" name="class_id" value={classId} />

      {/* Form-level error */}
      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((msg: string, i: number) => (
            <p key={i} className="text-sm text-red-700">{msg}</p>
          ))}
        </div>
      )}

      {/* Warning banner */}
      <div className="rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3">
        <p className="text-sm font-bold text-amber-800">
          ⚠ Opération groupée
        </p>
        <p className="text-sm text-amber-700 mt-0.5">
          Cette action créera une facture pour chaque élève actif de{' '}
          <strong>{className}</strong>
          {' '}({academicYearName}).
          Les élèves déjà facturés avec le même titre et la même échéance seront ignorés.
        </p>
      </div>

      {/* Enrolled count */}
      <div className="flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3">
        <span className="text-2xl font-bold text-primary-700">{enrolledCount}</span>
        <span className="text-sm text-primary-700">
          élève{enrolledCount !== 1 ? 's' : ''} actif{enrolledCount !== 1 ? 's' : ''} inscrit{enrolledCount !== 1 ? 's' : ''} dans cette classe
        </span>
      </div>

      {/* Title */}
      <div>
        <label htmlFor="bulk_title" className="block text-sm font-medium text-gray-700 mb-1">
          Titre de la facture{' '}
          <span className="font-normal text-gray-400">(optionnel — un titre par défaut sera utilisé)</span>
        </label>
        <input
          id="bulk_title"
          name="title"
          type="text"
          defaultValue={defaultTitle}
          placeholder={defaultTitle}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
      </div>

      {/* Due date */}
      <div>
        <label htmlFor="bulk_due_date" className="block text-sm font-medium text-gray-700 mb-1">
          Date d&apos;échéance <span className="font-normal text-gray-400">(optionnel)</span>
        </label>
        <input
          id="bulk_due_date"
          name="due_date"
          type="date"
          className="block w-full sm:max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
      </div>

      {/* Fee items */}
      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">
          Frais du catalogue <span className="font-normal text-gray-400">(sélectionnez un ou plusieurs)</span>
        </p>
        {feeItems.length === 0 ? (
          <p className="text-sm text-gray-500 rounded-lg border border-sand-200 bg-sand-50 px-4 py-3">
            Aucun frais actif au catalogue.{' '}
            <a href="/school/finance/fees/new" className="text-primary-600 hover:underline">
              Créer un frais
            </a>
          </p>
        ) : (
          <div className="space-y-1.5">
            {feeItems.map((fee) => {
              const checked = selectedFeeIds.has(fee.id)
              return (
                <label
                  key={fee.id}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                    checked
                      ? 'border-primary-400 bg-primary-50'
                      : 'border-sand-200 bg-white hover:border-primary-200 hover:bg-sand-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    name="fee_item_ids"
                    value={fee.id}
                    checked={checked}
                    onChange={() => toggleFee(fee.id)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${checked ? 'text-primary-800' : 'text-gray-800'}`}>
                      {fee.name}
                    </p>
                    {fee.description && (
                      <p className="text-xs text-gray-400 truncate">{fee.description}</p>
                    )}
                  </div>
                  <span className={`text-sm font-semibold whitespace-nowrap ${checked ? 'text-primary-700' : 'text-gray-600'}`}>
                    {fmt(fee.amount)}
                  </span>
                </label>
              )
            })}
          </div>
        )}
        {state.errors?.fee_items && (
          <p className="mt-1 text-xs text-red-600">{state.errors.fee_items[0]}</p>
        )}
      </div>

      {/* Custom line */}
      <div className="rounded-lg border border-sand-200 bg-sand-50 px-4 py-4">
        <p className="text-sm font-medium text-gray-700 mb-3">
          Ligne personnalisée <span className="font-normal text-gray-400">(optionnel)</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="custom_description" className="block text-xs font-medium text-gray-600 mb-1">Désignation</label>
            <input
              id="custom_description"
              name="custom_description"
              type="text"
              placeholder="Autre frais…"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 bg-white shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
            />
          </div>
          <div>
            <label htmlFor="custom_amount" className="block text-xs font-medium text-gray-600 mb-1">Montant (FCFA)</label>
            <div className="relative">
              <input
                id="custom_amount"
                name="custom_amount"
                type="number"
                min="1"
                step="1"
                placeholder="0"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 pr-16 text-sm text-gray-900 placeholder-gray-400 bg-white shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-400">FCFA</span>
            </div>
            {state.errors?.custom_amount && (
              <p className="mt-1 text-xs text-red-600">{state.errors.custom_amount[0]}</p>
            )}
          </div>
        </div>
      </div>

      {/* Running total */}
      {(feeTotal > 0 || customCalc > 0) && (
        <div className="overflow-hidden rounded-xl grid grid-cols-2 shadow-sm">
          <div className="bg-primary-600 px-4 py-4 text-center">
            <p className="text-lg font-bold text-white">{fmt(perStudent)}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-0.5">Par élève</p>
          </div>
          <div className="bg-primary-800 px-4 py-4 text-center">
            <p className="text-lg font-bold text-white">{fmt(grandTotal)}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-0.5">
              Total · {enrolledCount} élève{enrolledCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 border-t border-sand-200 pt-4">
        <SubmitButton count={enrolledCount} />
        <a
          href="/school/finance/invoices/bulk"
          className="text-sm text-gray-500 hover:text-gray-800 hover:underline"
        >
          Changer de classe
        </a>
        <a
          href="/school/finance/invoices"
          className="text-sm text-gray-500 hover:text-gray-800 hover:underline"
        >
          Annuler
        </a>
      </div>
    </form>
  )
}
