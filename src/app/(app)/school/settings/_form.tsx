'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { updateSchoolProfile, type SchoolProfileState } from './actions'

function inputClass(hasError: boolean): string {
  return (
    'mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ' +
    (hasError
      ? 'border-red-400 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 text-gray-900 placeholder-gray-400 focus:border-primary-600 focus:ring-primary-600')
  )
}

function FieldErrors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return <span id={id} />
  return <ul id={id} className="mt-1 space-y-0.5" role="list">{errors.map((m, i) => <li key={i} className="text-xs text-red-600">{m}</li>)}</ul>
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="inline-flex justify-center rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2">
      {pending ? 'Enregistrement…' : 'Enregistrer'}
    </button>
  )
}

type Defaults = { name: string; phone: string | null; email: string | null; address: string | null }

const initialState: SchoolProfileState = {}

export function SchoolProfileForm({ defaults, cancelHref }: { defaults: Defaults; cancelHref: string }) {
  const [state, formAction] = useFormState(updateSchoolProfile, initialState)
  const e = state.errors

  return (
    <form action={formAction} noValidate className="space-y-5">
      {e?._form && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3">
          {e._form.map((m, i) => <p key={i} className="text-sm text-red-700">{m}</p>)}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nom de l&apos;école <span className="text-red-500" aria-hidden="true">*</span></label>
        <input id="name" name="name" type="text" required defaultValue={defaults.name}
          aria-invalid={e?.name ? 'true' : undefined} className={inputClass(!!e?.name)} />
        <FieldErrors id="name-errors" errors={e?.name} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Téléphone</label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={defaults.phone ?? ''} className={inputClass(!!e?.phone)} />
          <FieldErrors id="phone-errors" errors={e?.phone} />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" defaultValue={defaults.email ?? ''} className={inputClass(!!e?.email)} />
          <FieldErrors id="email-errors" errors={e?.email} />
        </div>
      </div>

      <div>
        <label htmlFor="address" className="block text-sm font-medium text-gray-700">Adresse</label>
        <textarea id="address" name="address" rows={2} defaultValue={defaults.address ?? ''} className={inputClass(!!e?.address)} />
        <FieldErrors id="address-errors" errors={e?.address} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        <SubmitButton />
        <a href={cancelHref} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</a>
      </div>
    </form>
  )
}
