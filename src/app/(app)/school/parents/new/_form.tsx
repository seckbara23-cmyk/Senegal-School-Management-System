'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createParent, type CreateParentState } from '../actions'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputClass =
  'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null
  return <p className="mt-1 text-xs text-red-600">{messages[0]}</p>
}

// ─── Submit button ─────────────────────────────────────────────────────────────

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
    >
      {pending ? 'Enregistrement…' : 'Créer le dossier'}
    </button>
  )
}

// ─── Form ─────────────────────────────────────────────────────────────────────

const initialState: CreateParentState = {}

export function ParentForm() {
  const [state, formAction] = useFormState(createParent, initialState)

  return (
    <form action={formAction} noValidate className="space-y-5">

      {/* General error */}
      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((msg, i) => (
            <p key={i} className="text-sm text-red-700">{msg}</p>
          ))}
        </div>
      )}

      {/* Identity */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="last_name" className="block text-sm font-medium text-gray-700">
            Nom <span className="text-red-500">*</span>
          </label>
          <input
            id="last_name"
            name="last_name"
            type="text"
            autoComplete="family-name"
            placeholder="DIALLO"
            className={inputClass}
          />
          <FieldError messages={state.errors?.last_name} />
        </div>
        <div>
          <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">
            Prénom <span className="text-red-500">*</span>
          </label>
          <input
            id="first_name"
            name="first_name"
            type="text"
            autoComplete="given-name"
            placeholder="Aminata"
            className={inputClass}
          />
          <FieldError messages={state.errors?.first_name} />
        </div>
      </div>

      {/* Contact */}
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
            placeholder="+221 77 000 00 00"
            className={inputClass}
          />
          <FieldError messages={state.errors?.phone} />
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
            placeholder="aminata.diallo@email.com"
            className={inputClass}
          />
          <FieldError messages={state.errors?.email} />
        </div>
      </div>

      {/* Professional */}
      <div>
        <label htmlFor="occupation" className="block text-sm font-medium text-gray-700">
          Profession
        </label>
        <input
          id="occupation"
          name="occupation"
          type="text"
          placeholder="Commerçant, Enseignant, Fonctionnaire…"
          className={inputClass}
        />
        <FieldError messages={state.errors?.occupation} />
      </div>

      {/* Address */}
      <div>
        <label htmlFor="address" className="block text-sm font-medium text-gray-700">
          Adresse
        </label>
        <textarea
          id="address"
          name="address"
          rows={2}
          placeholder="Quartier, rue, ville…"
          className={inputClass}
        />
        <FieldError messages={state.errors?.address} />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 border-t border-sand-200 pt-4">
        <SubmitButton />
        <a
          href="/school/parents"
          className="text-sm text-gray-500 hover:text-gray-800 hover:underline"
        >
          Annuler
        </a>
      </div>
    </form>
  )
}
