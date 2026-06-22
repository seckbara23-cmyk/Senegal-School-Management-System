'use client'

// Shared form primitives for the transport module forms (vehicles, drivers,
// routes). Mirrors the input/error/submit styling used across the school CRUD
// forms so the transport pages feel native.

import { useFormStatus } from 'react-dom'

export function inputClass(hasError: boolean): string {
  return (
    'mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm ' +
    'focus:outline-none focus:ring-1 ' +
    'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 ' +
    (hasError
      ? 'border-red-400 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 text-gray-900 placeholder-gray-400 focus:border-primary-600 focus:ring-primary-600')
  )
}

export function FieldErrors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return <span id={id} />
  return (
    <ul id={id} className="mt-1 space-y-0.5" role="list">
      {errors.map((msg, i) => (
        <li key={i} className="text-xs text-red-600">{msg}</li>
      ))}
    </ul>
  )
}

export function FormError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3">
      {errors.map((msg, i) => (
        <p key={i} className="text-sm text-red-700">{msg}</p>
      ))}
    </div>
  )
}

export function SubmitButton({ label, pendingLabel = 'Enregistrement…' }: { label: string; pendingLabel?: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2"
    >
      {pending ? pendingLabel : label}
    </button>
  )
}
