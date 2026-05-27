'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { updateTeacher, type TeacherFormState } from '../../actions'

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
      {pending ? 'Enregistrement…' : 'Enregistrer les modifications'}
    </button>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TeacherData = {
  id:              string
  first_name:      string
  last_name:       string
  employee_number: string
  phone:           string | null
  email:           string | null
}

// ─── Form ─────────────────────────────────────────────────────────────────────

const initialState: TeacherFormState = {}

export function EditTeacherForm({ teacher }: { teacher: TeacherData }) {
  const [state, formAction] = useFormState(updateTeacher, initialState)

  return (
    <form action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="teacher_id" value={teacher.id} />

      {/* Form-level error */}
      {state.errors?._form && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((msg, i) => (
            <p key={i} className="text-sm text-red-700">{msg}</p>
          ))}
        </div>
      )}

      {/* ── Row 1: Nom / Prénom ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="last_name" className="block text-sm font-medium text-gray-700">
            Nom <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id="last_name"
            name="last_name"
            type="text"
            autoComplete="family-name"
            required
            defaultValue={teacher.last_name}
            aria-describedby="last_name-errors"
            aria-invalid={state.errors?.last_name ? 'true' : undefined}
            className={inputClass(!!state.errors?.last_name)}
          />
          <FieldErrors id="last_name-errors" errors={state.errors?.last_name} />
        </div>

        <div>
          <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">
            Prénom <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id="first_name"
            name="first_name"
            type="text"
            autoComplete="given-name"
            required
            defaultValue={teacher.first_name}
            aria-describedby="first_name-errors"
            aria-invalid={state.errors?.first_name ? 'true' : undefined}
            className={inputClass(!!state.errors?.first_name)}
          />
          <FieldErrors id="first_name-errors" errors={state.errors?.first_name} />
        </div>
      </div>

      {/* ── Row 2: Matricule ────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="employee_number" className="block text-sm font-medium text-gray-700">
          Matricule <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id="employee_number"
          name="employee_number"
          type="text"
          required
          defaultValue={teacher.employee_number}
          aria-describedby="employee_number-errors"
          aria-invalid={state.errors?.employee_number ? 'true' : undefined}
          className={inputClass(!!state.errors?.employee_number)}
        />
        <FieldErrors id="employee_number-errors" errors={state.errors?.employee_number} />
      </div>

      {/* ── Row 3: Téléphone / Email ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
            Téléphone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={teacher.phone ?? ''}
            aria-describedby="phone-errors"
            className={inputClass(!!state.errors?.phone)}
          />
          <FieldErrors id="phone-errors" errors={state.errors?.phone} />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email professionnel
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={teacher.email ?? ''}
            aria-describedby="email-errors"
            className={inputClass(!!state.errors?.email)}
          />
          <FieldErrors id="email-errors" errors={state.errors?.email} />
        </div>
      </div>

      {/* Required note */}
      <p className="text-xs text-gray-500">
        <span className="text-red-500" aria-hidden="true">*</span> Champs obligatoires
      </p>

      {/* ── Actions ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        <SubmitButton />
        <a
          href={`/school/teachers/${teacher.id}`}
          className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
        >
          Annuler
        </a>
      </div>
    </form>
  )
}
