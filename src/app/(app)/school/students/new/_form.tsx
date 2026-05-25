'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createStudent, type CreateStudentState } from '../actions'

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
// Must be a child of the <form> so useFormStatus can read the pending state.

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-md bg-primary-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Enregistrement…' : "Enregistrer l’élève"}
    </button>
  )
}

// ─── Form ─────────────────────────────────────────────────────────────────────

const initialState: CreateStudentState = {}

export function StudentNewForm() {
  const [state, formAction] = useFormState(createStudent, initialState)

  return (
    <form action={formAction} noValidate className="space-y-5">
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

      {/* ── Row 1: Prénom / Nom ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">
            Prénom{' '}
            <span className="text-red-500" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="first_name"
            name="first_name"
            type="text"
            autoComplete="given-name"
            required
            placeholder="ex. Aminata"
            aria-describedby="first_name-errors"
            aria-invalid={state.errors?.first_name ? 'true' : undefined}
            className={inputClass(!!state.errors?.first_name)}
          />
          <FieldErrors id="first_name-errors" errors={state.errors?.first_name} />
        </div>

        <div>
          <label htmlFor="last_name" className="block text-sm font-medium text-gray-700">
            Nom{' '}
            <span className="text-red-500" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="last_name"
            name="last_name"
            type="text"
            autoComplete="family-name"
            required
            placeholder="ex. Diallo"
            aria-describedby="last_name-errors"
            aria-invalid={state.errors?.last_name ? 'true' : undefined}
            className={inputClass(!!state.errors?.last_name)}
          />
          <FieldErrors id="last_name-errors" errors={state.errors?.last_name} />
        </div>
      </div>

      {/* ── Row 2: N° d'admission ───────────────────────────────────────────── */}
      <div>
        <label htmlFor="admission_number" className="block text-sm font-medium text-gray-700">
          {/* Unicode apostrophe avoids JSX unescaped-entity lint error */}
          {`Numéro d’admission`}{' '}
          <span className="text-red-500" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="admission_number"
          name="admission_number"
          type="text"
          required
          placeholder="ex. 2024-001"
          aria-describedby="admission_number-errors"
          aria-invalid={state.errors?.admission_number ? 'true' : undefined}
          className={inputClass(!!state.errors?.admission_number)}
        />
        <FieldErrors id="admission_number-errors" errors={state.errors?.admission_number} />
      </div>

      {/* ── Row 3: Sexe / Date de naissance ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="gender" className="block text-sm font-medium text-gray-700">
            Sexe
          </label>
          <select
            id="gender"
            name="gender"
            defaultValue=""
            aria-describedby="gender-errors"
            className={inputClass(!!state.errors?.gender)}
          >
            <option value="">{`— Non renseigné —`}</option>
            <option value="male">Masculin</option>
            <option value="female">Féminin</option>
            <option value="other">Autre</option>
          </select>
          <FieldErrors id="gender-errors" errors={state.errors?.gender} />
        </div>

        <div>
          <label htmlFor="date_of_birth" className="block text-sm font-medium text-gray-700">
            Date de naissance
          </label>
          <input
            id="date_of_birth"
            name="date_of_birth"
            type="date"
            aria-describedby="date_of_birth-errors"
            aria-invalid={state.errors?.date_of_birth ? 'true' : undefined}
            className={inputClass(!!state.errors?.date_of_birth)}
          />
          <FieldErrors id="date_of_birth-errors" errors={state.errors?.date_of_birth} />
        </div>
      </div>

      {/* ── Row 4: Statut ───────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="status" className="block text-sm font-medium text-gray-700">
          Statut
        </label>
        <select
          id="status"
          name="status"
          defaultValue="active"
          aria-describedby="status-errors"
          className={inputClass(!!state.errors?.status)}
        >
          <option value="active">Actif</option>
          <option value="inactive">Inactif</option>
          <option value="graduated">Diplômé</option>
        </select>
        <FieldErrors id="status-errors" errors={state.errors?.status} />
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
          href="/school/students"
          className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
        >
          Annuler
        </a>
      </div>
    </form>
  )
}
