'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { updateParent, type ParentFormState } from '../../actions'

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

type ParentData = {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  address: string | null
  occupation: string | null
}

const initialState: ParentFormState = {}

export function EditParentForm({ parent }: { parent: ParentData }) {
  const [state, formAction] = useFormState(updateParent, initialState)

  return (
    <form action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="parent_id" value={parent.id} />

      {state.errors?._form && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((msg, i) => (
            <p key={i} className="text-sm text-red-700">{msg}</p>
          ))}
        </div>
      )}

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
            defaultValue={parent.last_name}
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
            defaultValue={parent.first_name}
            aria-describedby="first_name-errors"
            aria-invalid={state.errors?.first_name ? 'true' : undefined}
            className={inputClass(!!state.errors?.first_name)}
          />
          <FieldErrors id="first_name-errors" errors={state.errors?.first_name} />
        </div>
      </div>

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
            defaultValue={parent.phone ?? ''}
            aria-describedby="phone-errors"
            aria-invalid={state.errors?.phone ? 'true' : undefined}
            className={inputClass(!!state.errors?.phone)}
          />
          <FieldErrors id="phone-errors" errors={state.errors?.phone} />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Adresse email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={parent.email ?? ''}
            aria-describedby="email-errors"
            aria-invalid={state.errors?.email ? 'true' : undefined}
            className={inputClass(!!state.errors?.email)}
          />
          <FieldErrors id="email-errors" errors={state.errors?.email} />
        </div>
      </div>

      <div>
        <label htmlFor="occupation" className="block text-sm font-medium text-gray-700">
          Profession
        </label>
        <input
          id="occupation"
          name="occupation"
          type="text"
          defaultValue={parent.occupation ?? ''}
          aria-describedby="occupation-errors"
          aria-invalid={state.errors?.occupation ? 'true' : undefined}
          className={inputClass(!!state.errors?.occupation)}
        />
        <FieldErrors id="occupation-errors" errors={state.errors?.occupation} />
      </div>

      <div>
        <label htmlFor="address" className="block text-sm font-medium text-gray-700">
          Adresse
        </label>
        <textarea
          id="address"
          name="address"
          rows={3}
          defaultValue={parent.address ?? ''}
          aria-describedby="address-errors"
          aria-invalid={state.errors?.address ? 'true' : undefined}
          className={inputClass(!!state.errors?.address)}
        />
        <FieldErrors id="address-errors" errors={state.errors?.address} />
      </div>

      <p className="text-xs text-gray-500">
        <span className="text-red-500" aria-hidden="true">*</span> Champs obligatoires
      </p>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        <SubmitButton />
        <a
          href={`/school/parents/${parent.id}`}
          className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
        >
          Annuler
        </a>
      </div>
    </form>
  )
}
