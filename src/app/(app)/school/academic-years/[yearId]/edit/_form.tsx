'use client'

import { useState }                          from 'react'
import { useFormState, useFormStatus }       from 'react-dom'
import { updateAcademicYear, type AcademicYearFormState } from '../../actions'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inputClass(hasError: boolean): string {
  return (
    'mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm ' +
    'focus:outline-none focus:ring-1 ' +
    'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 ' +
    (hasError
      ? 'border-red-400 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 text-gray-900 placeholder-gray-400 focus:border-primary-600 focus:ring-primary-600')
  )
}

function FieldErrors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return <span id={id} />
  return (
    <ul id={id} className="mt-1 space-y-0.5" role="list">
      {errors.map((msg, i) => (
        <li key={i} className="text-xs text-red-600">{msg}</li>
      ))}
    </ul>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2"
    >
      {pending ? "Enregistrement…" : "Enregistrer les modifications"}
    </button>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

type YearData = {
  id:        string
  name:      string
  starts_on: string
  ends_on:   string
  is_active: boolean
}

// ─── Form ─────────────────────────────────────────────────────────────────────

const initialState: AcademicYearFormState = {}

export function EditAcademicYearForm({ year }: { year: YearData }) {
  const [state, formAction] = useFormState(updateAcademicYear, initialState)
  const [isActive, setIsActive] = useState(year.is_active)

  return (
    <form action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="year_id" value={year.id} />

      {/* ── Erreur globale ──────────────────────────────────────────────────── */}
      {state.errors?._form && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((msg, i) => (
            <p key={i} className="text-sm text-red-700">{msg}</p>
          ))}
        </div>
      )}

      {/* ── Nom ─────────────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Nom de l&apos;année <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={year.name}
          aria-describedby="name-errors"
          aria-invalid={state.errors?.name ? 'true' : undefined}
          className={inputClass(!!state.errors?.name)}
        />
        <FieldErrors id="name-errors" errors={state.errors?.name} />
      </div>

      {/* ── Dates ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="starts_on" className="block text-sm font-medium text-gray-700">
            Date de début <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id="starts_on"
            name="starts_on"
            type="date"
            required
            defaultValue={year.starts_on}
            aria-describedby="starts_on-errors"
            aria-invalid={state.errors?.starts_on ? 'true' : undefined}
            className={inputClass(!!state.errors?.starts_on)}
          />
          <FieldErrors id="starts_on-errors" errors={state.errors?.starts_on} />
        </div>
        <div>
          <label htmlFor="ends_on" className="block text-sm font-medium text-gray-700">
            Date de fin <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id="ends_on"
            name="ends_on"
            type="date"
            required
            defaultValue={year.ends_on}
            aria-describedby="ends_on-errors"
            aria-invalid={state.errors?.ends_on ? 'true' : undefined}
            className={inputClass(!!state.errors?.ends_on)}
          />
          <FieldErrors id="ends_on-errors" errors={state.errors?.ends_on} />
        </div>
      </div>

      {/* ── Statut actif ────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-sand-200 bg-sand-50 px-4 py-3 space-y-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="is_active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
          />
          <div>
            <p className="text-sm font-medium text-gray-900">Année en cours</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Cette année sera l&apos;année active de l&apos;établissement.
            </p>
          </div>
        </label>

        {isActive && !year.is_active && (
          <label className="ml-7 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="deactivate_others"
              defaultChecked
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
            />
            <p className="text-sm text-gray-700">
              Désactiver automatiquement les autres années actives
            </p>
          </label>
        )}
      </div>

      <p className="text-xs text-gray-500">
        <span className="text-red-500" aria-hidden="true">*</span> Champs obligatoires
      </p>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        <SubmitButton />
        <a
          href={`/school/academic-years/${year.id}`}
          className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
        >
          Annuler
        </a>
      </div>
    </form>
  )
}
