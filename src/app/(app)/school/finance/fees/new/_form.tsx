'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createFeeItem, type FeeItemState } from '../../actions'

export type AcademicYearOption = {
  id: string
  name: string
  is_active?: boolean
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
    >
      {pending ? 'Enregistrement…' : 'Enregistrer le frais'}
    </button>
  )
}

const initialState: FeeItemState = {}

export function FeeItemForm({ academicYears, activeYearId }: { academicYears: AcademicYearOption[]; activeYearId?: string }) {
  const [state, formAction] = useFormState(createFeeItem, initialState)

  return (
    <form action={formAction} noValidate className="space-y-6">

      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((msg, i) => (
            <p key={i} className="text-sm text-red-700">{msg}</p>
          ))}
        </div>
      )}

      {/* Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Désignation <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          placeholder="Frais de scolarité, Fournitures scolaires…"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        {state.errors?.name && (
          <p className="mt-1 text-xs text-red-600">{state.errors.name[0]}</p>
        )}
      </div>

      {/* Amount */}
      <div>
        <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
          Montant (FCFA) <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input
            id="amount"
            name="amount"
            type="number"
            min="0"
            step="1"
            placeholder="0"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 pr-16 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-400">
            FCFA
          </span>
        </div>
        {state.errors?.amount && (
          <p className="mt-1 text-xs text-red-600">{state.errors.amount[0]}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
          Description <span className="font-normal text-gray-400">(optionnel)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          placeholder="Détails supplémentaires…"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        {state.errors?.description && (
          <p className="mt-1 text-xs text-red-600">{state.errors.description[0]}</p>
        )}
      </div>

      {/* Due date + Academic year */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          {state.errors?.due_date && (
            <p className="mt-1 text-xs text-red-600">{state.errors.due_date[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="academic_year_id" className="block text-sm font-medium text-gray-700 mb-1">
            Année scolaire <span className="font-normal text-gray-400">(optionnel)</span>
          </label>
          <select
            id="academic_year_id"
            name="academic_year_id"
            defaultValue={activeYearId ?? ''}
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            <option value="">— Toutes années —</option>
            {academicYears.map((y) => (
              <option key={y.id} value={y.id}>{y.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Is active */}
      <div className="flex items-center gap-3">
        <input
          id="is_active"
          name="is_active"
          type="checkbox"
          defaultChecked
          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
        />
        <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
          Frais actif <span className="font-normal text-gray-400">(visible lors de la création d&apos;une facture)</span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 border-t border-sand-200 pt-4">
        <SubmitButton />
        <a
          href="/school/finance/fees"
          className="text-sm text-gray-500 hover:text-gray-800 hover:underline"
        >
          Annuler
        </a>
      </div>
    </form>
  )
}
