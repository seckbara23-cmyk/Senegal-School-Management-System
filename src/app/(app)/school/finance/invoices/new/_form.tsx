'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createInvoice, type InvoiceState } from '../../actions'

export type StudentOption = {
  id: string
  first_name: string
  last_name: string
}

export type FeeItemOption = {
  id: string
  name: string
  amount: number
  description: string | null
}

export type AcademicYearOption = {
  id: string
  name: string
}

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
    >
      {pending ? 'Création…' : 'Créer la facture'}
    </button>
  )
}

const initialState: InvoiceState = {}

export function InvoiceForm({
  students,
  feeItems,
  academicYears,
}: {
  students: StudentOption[]
  feeItems: FeeItemOption[]
  academicYears: AcademicYearOption[]
}) {
  const [state, formAction] = useFormState(createInvoice, initialState)
  const [selectedFeeIds, setSelectedFeeIds] = useState<Set<string>>(new Set())
  const [customAmount, setCustomAmount] = useState('')

  function toggleFee(id: string) {
    setSelectedFeeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const feeTotal = feeItems
    .filter((f) => selectedFeeIds.has(f.id))
    .reduce((s, f) => s + f.amount, 0)
  const customVal = parseInt(customAmount, 10)
  const customTotal = isNaN(customVal) || customVal <= 0 ? 0 : customVal
  const grandTotal = feeTotal + customTotal

  return (
    <form action={formAction} noValidate className="space-y-6">

      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((msg, i) => (
            <p key={i} className="text-sm text-red-700">{msg}</p>
          ))}
        </div>
      )}

      {/* Student */}
      <div>
        <label htmlFor="student_id" className="block text-sm font-medium text-gray-700 mb-1">
          Élève <span className="text-red-500">*</span>
        </label>
        {students.length === 0 ? (
          <p className="text-sm text-amber-700">
            Aucun élève enregistré.{' '}
            <a href="/school/students/new" className="underline hover:text-amber-900">Ajouter un élève</a>
          </p>
        ) : (
          <select
            id="student_id"
            name="student_id"
            defaultValue=""
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            <option value="">— Sélectionner un élève —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.last_name} {s.first_name}
              </option>
            ))}
          </select>
        )}
        {state.errors?.student_id && (
          <p className="mt-1 text-xs text-red-600">{state.errors.student_id[0]}</p>
        )}
      </div>

      {/* Title + due date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Titre de la facture <span className="text-red-500">*</span>
          </label>
          <input
            id="title"
            name="title"
            type="text"
            placeholder="Frais de scolarité T1 2025…"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
          {state.errors?.title && (
            <p className="mt-1 text-xs text-red-600">{state.errors.title[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="due_date" className="block text-sm font-medium text-gray-700 mb-1">
            Date d&apos;échéance <span className="font-normal text-gray-400">(optionnel)</span>
          </label>
          <input
            id="due_date"
            name="due_date"
            type="date"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
      </div>

      {/* Academic year */}
      {academicYears.length > 0 && (
        <div>
          <label htmlFor="academic_year_id" className="block text-sm font-medium text-gray-700 mb-1">
            Année scolaire <span className="font-normal text-gray-400">(optionnel)</span>
          </label>
          <select
            id="academic_year_id"
            name="academic_year_id"
            defaultValue=""
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            <option value="">— Aucune —</option>
            {academicYears.map((y) => (
              <option key={y.id} value={y.id}>{y.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Fee items from catalog */}
      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">
          Frais du catalogue <span className="font-normal text-gray-400">(sélectionnez un ou plusieurs)</span>
        </p>

        {feeItems.length === 0 ? (
          <p className="text-sm text-gray-500 rounded-lg border border-sand-200 bg-sand-50 px-4 py-3">
            Aucun frais au catalogue.{' '}
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
            <label htmlFor="custom_description" className="block text-xs font-medium text-gray-600 mb-1">
              Désignation
            </label>
            <input
              id="custom_description"
              name="custom_description"
              type="text"
              placeholder="Autre frais…"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 bg-white shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
            />
            {state.errors?.custom_description && (
              <p className="mt-1 text-xs text-red-600">{state.errors.custom_description[0]}</p>
            )}
          </div>
          <div>
            <label htmlFor="custom_amount" className="block text-xs font-medium text-gray-600 mb-1">
              Montant (FCFA)
            </label>
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
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-400">
                FCFA
              </span>
            </div>
            {state.errors?.custom_amount && (
              <p className="mt-1 text-xs text-red-600">{state.errors.custom_amount[0]}</p>
            )}
          </div>
        </div>
      </div>

      {/* Transport fee opt-in */}
      <label className="flex items-start gap-3 rounded-lg border border-sand-200 bg-white px-4 py-3 cursor-pointer hover:bg-sand-50">
        <input type="checkbox" name="include_transport" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600" />
        <span>
          <span className="block text-sm font-medium text-gray-800">Inclure les frais de transport</span>
          <span className="block text-xs text-gray-400">Ajoute l’abonnement transport mensuel de l’élève (si un abonnement actif existe).</span>
        </span>
      </label>

      {/* Grand total */}
      <div className="rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-primary-800">Total de la facture <span className="font-normal text-primary-500">(hors transport)</span></span>
        <span className="text-lg font-bold text-primary-700">{fmt(grandTotal)}</span>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 border-t border-sand-200 pt-4">
        <SubmitButton />
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
