'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createPeriod, type CreatePeriodState } from '../../actions'

type AcademicYear = { id: string; name: string; is_active: boolean }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm"
    >
      {pending ? 'Enregistrement…' : 'Créer la période'}
    </button>
  )
}

const initialState: CreatePeriodState = {}

export function NewPeriodForm({ academicYears, hasNoActiveYear }: { academicYears: AcademicYear[]; hasNoActiveYear?: boolean }) {
  const [state, formAction] = useFormState(createPeriod, initialState)

  const defaultYear = academicYears.find((y) => y.is_active) ?? academicYears[0]

  return (
    <form action={formAction} className="space-y-5">

      {hasNoActiveYear && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-800">Aucune année scolaire active</p>
            <p className="mt-0.5 text-xs text-amber-700">
              Créez ou activez une année scolaire avant de créer une période.{' '}
              <a href="/school/academic-years" className="font-semibold underline hover:text-amber-900">
                Gérer les années scolaires →
              </a>
            </p>
          </div>
        </div>
      )}

      {state.errors?._form && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.errors._form.join(' ')}
        </div>
      )}

      {/* Academic year */}
      <div>
        <label htmlFor="academic_year_id" className="block text-sm font-medium text-gray-700 mb-1">
          Année scolaire <span className="text-red-500">*</span>
        </label>
        <select
          id="academic_year_id"
          name="academic_year_id"
          defaultValue={defaultYear?.id ?? ''}
          required
          className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
        >
          {academicYears.map((y) => (
            <option key={y.id} value={y.id}>{y.name}{y.is_active ? ' (active)' : ''}</option>
          ))}
        </select>
        {state.errors?.academic_year_id && (
          <p className="mt-1 text-xs text-red-600">{state.errors.academic_year_id.join(' ')}</p>
        )}
      </div>

      {/* Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Nom de la période <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="ex. 1er Trimestre"
          className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder-gray-400 focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        {state.errors?.name && (
          <p className="mt-1 text-xs text-red-600">{state.errors.name.join(' ')}</p>
        )}
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="starts_on" className="block text-sm font-medium text-gray-700 mb-1">
            Début <span className="text-gray-400 font-normal">(facultatif)</span>
          </label>
          <input
            id="starts_on"
            name="starts_on"
            type="date"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div>
          <label htmlFor="ends_on" className="block text-sm font-medium text-gray-700 mb-1">
            Fin <span className="text-gray-400 font-normal">(facultatif)</span>
          </label>
          <input
            id="ends_on"
            name="ends_on"
            type="date"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
      </div>

      {/* Active */}
      <div className="flex items-center gap-3">
        <input
          id="is_active"
          name="is_active"
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
          Période active
        </label>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <SubmitButton />
        <a
          href="/school/academics/periods"
          className="text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Annuler
        </a>
      </div>

    </form>
  )
}
