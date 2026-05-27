'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createClass, type CreateClassState } from '../actions'

// ─── Types ────────────────────────────────────────────────────────────────────

type AcademicYear = {
  id: string
  name: string
  starts_on: string
  ends_on: string
  is_active: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inputClass(hasError: boolean): string {
  return (
    'mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm ' +
    'focus:outline-none focus:ring-1 ' +
    'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 ' +
    (hasError
      ? 'border-red-400 text-red-900 placeholder-red-300 ' +
        'focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 text-gray-900 placeholder-gray-400 ' +
        'focus:border-primary-600 focus:ring-primary-600')
  )
}

function FieldErrors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors || errors.length === 0) return <span id={id} />
  return (
    <ul id={id} className="mt-1 space-y-0.5" role="list">
      {errors.map((msg, i) => (
        <li key={i} className="text-xs text-red-600">
          {msg}
        </li>
      ))}
    </ul>
  )
}

// ─── Submit button ─────────────────────────────────────────────────────────────

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-md bg-primary-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Enregistrement…' : 'Créer la classe'}
    </button>
  )
}

// ─── Form ─────────────────────────────────────────────────────────────────────

const initialState: CreateClassState = {}

export function ClassNewForm({ academicYears, hasNoActiveYear }: { academicYears: AcademicYear[]; hasNoActiveYear?: boolean }) {
  const [state, formAction] = useFormState(createClass, initialState)
  // Default to 'new' when no years exist, 'existing' otherwise.
  const [yearMode, setYearMode] = useState<'existing' | 'new'>(
    academicYears.length > 0 ? 'existing' : 'new'
  )

  return (
    <form action={formAction} noValidate className="space-y-6">
      {/* General / auth error */}
      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((msg, i) => (
            <p key={i} className="text-sm text-red-700">
              {msg}
            </p>
          ))}
        </div>
      )}

      {/* ── Année scolaire ──────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-sand-200 bg-sand-50 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Année scolaire</h2>
          {/* Toggle only shown when years exist */}
          {academicYears.length > 0 && (
            <button
              type="button"
              onClick={() => setYearMode((m) => (m === 'existing' ? 'new' : 'existing'))}
              className="text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline"
            >
              {yearMode === 'existing'
                ? '+ Créer une nouvelle année'
                : '← Utiliser une année existante'}
            </button>
          )}
        </div>

        {hasNoActiveYear && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-800">Aucune année scolaire active</p>
              <p className="mt-0.5 text-xs text-amber-700">
                Créez ou activez une année scolaire avant de créer une classe.{' '}
                <a href="/school/academic-years" className="font-semibold underline hover:text-amber-900">
                  Gérer les années scolaires →
                </a>
              </p>
            </div>
          </div>
        )}

        {yearMode === 'existing' ? (
          /* ── Pick existing year ─────────────────────────────────────────── */
          <div>
            <label htmlFor="academic_year_id" className="block text-sm font-medium text-gray-700">
              Année scolaire{' '}
              <span className="text-red-500" aria-hidden="true">
                *
              </span>
            </label>
            <select
              id="academic_year_id"
              name="academic_year_id"
              defaultValue={academicYears.find((y) => y.is_active)?.id ?? academicYears[0]?.id ?? ''}
              aria-describedby="academic_year_id-errors"
              className={inputClass(!!state.errors?.academic_year_id)}
            >
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.is_active ? ' (active)' : ''}
                </option>
              ))}
            </select>
            <FieldErrors id="academic_year_id-errors" errors={state.errors?.academic_year_id} />
          </div>
        ) : (
          /* ── Create new year ────────────────────────────────────────────── */
          <>
            <input type="hidden" name="academic_year_id" value="new" />

            <div>
              <label htmlFor="year_name" className="block text-sm font-medium text-gray-700">
                Nom de l&apos;année{' '}
                <span className="text-red-500" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                id="year_name"
                name="year_name"
                type="text"
                placeholder="ex. 2024-2025"
                aria-describedby="year_name-errors"
                aria-invalid={state.errors?.year_name ? 'true' : undefined}
                className={inputClass(!!state.errors?.year_name)}
              />
              <FieldErrors id="year_name-errors" errors={state.errors?.year_name} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="year_starts_on" className="block text-sm font-medium text-gray-700">
                  Date de début{' '}
                  <span className="text-red-500" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id="year_starts_on"
                  name="year_starts_on"
                  type="date"
                  aria-describedby="year_starts_on-errors"
                  aria-invalid={state.errors?.year_starts_on ? 'true' : undefined}
                  className={inputClass(!!state.errors?.year_starts_on)}
                />
                <FieldErrors id="year_starts_on-errors" errors={state.errors?.year_starts_on} />
              </div>

              <div>
                <label htmlFor="year_ends_on" className="block text-sm font-medium text-gray-700">
                  Date de fin{' '}
                  <span className="text-red-500" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id="year_ends_on"
                  name="year_ends_on"
                  type="date"
                  aria-describedby="year_ends_on-errors"
                  aria-invalid={state.errors?.year_ends_on ? 'true' : undefined}
                  className={inputClass(!!state.errors?.year_ends_on)}
                />
                <FieldErrors id="year_ends_on-errors" errors={state.errors?.year_ends_on} />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                name="year_is_active"
                type="checkbox"
                defaultChecked
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
              />
              Marquer comme année en cours
            </label>
          </>
        )}
      </div>

      {/* ── Informations de la classe ────────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Informations de la classe</h2>

        {/* Nom */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Nom de la classe{' '}
            <span className="text-red-500" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="ex. CM2, 6ème, 2nde"
            aria-describedby="name-errors"
            aria-invalid={state.errors?.name ? 'true' : undefined}
            className={inputClass(!!state.errors?.name)}
          />
          <FieldErrors id="name-errors" errors={state.errors?.name} />
        </div>

        {/* Niveau / Section */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="level" className="block text-sm font-medium text-gray-700">
              Niveau
            </label>
            <input
              id="level"
              name="level"
              type="text"
              placeholder="ex. Cycle 3, Collège"
              aria-describedby="level-errors"
              className={inputClass(!!state.errors?.level)}
            />
            <FieldErrors id="level-errors" errors={state.errors?.level} />
          </div>

          <div>
            <label htmlFor="section" className="block text-sm font-medium text-gray-700">
              Section
            </label>
            <input
              id="section"
              name="section"
              type="text"
              placeholder="ex. A, B"
              aria-describedby="section-errors"
              className={inputClass(!!state.errors?.section)}
            />
            <FieldErrors id="section-errors" errors={state.errors?.section} />
          </div>
        </div>
      </div>

      {/* Required field note */}
      <p className="text-xs text-gray-500">
        <span className="text-red-500" aria-hidden="true">
          *
        </span>{' '}
        Champs obligatoires
      </p>

      {/* ── Actions ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        <SubmitButton />
        <a
          href="/school/classes"
          className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
        >
          Annuler
        </a>
      </div>
    </form>
  )
}
