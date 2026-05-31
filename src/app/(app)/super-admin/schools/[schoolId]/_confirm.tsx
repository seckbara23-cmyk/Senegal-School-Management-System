'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

const TONE: Record<string, string> = {
  danger:  'bg-red-600 hover:bg-red-700 text-white',
  primary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
  neutral: 'bg-gray-800 hover:bg-gray-700 text-white',
}

const TRIGGER_TONE: Record<string, string> = {
  danger:  'border-red-300 text-red-700 hover:bg-red-50',
  primary: 'border-indigo-300 text-indigo-700 hover:bg-indigo-50',
  neutral: 'border-gray-300 text-gray-700 hover:bg-gray-50',
}

function ConfirmSubmit({ label, tone }: { label: string; tone: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${TONE[tone]}`}
    >
      {pending ? '…' : label}
    </button>
  )
}

/**
 * Inline two-step confirmation control. Click the trigger to reveal a
 * message + Confirmer/Annuler; Confirmer submits a form bound to the given
 * server action with the supplied hidden fields.
 */
export function ConfirmButton({
  action,
  hiddens,
  trigger,
  message,
  confirmLabel = 'Confirmer',
  tone = 'neutral',
  disabled = false,
  disabledReason,
}: {
  action: (formData: FormData) => void | Promise<void>
  hiddens: Record<string, string>
  trigger: string
  message: string
  confirmLabel?: string
  tone?: 'danger' | 'primary' | 'neutral'
  disabled?: boolean
  disabledReason?: string
}) {
  const [open, setOpen] = useState(false)

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        title={disabledReason}
        className="cursor-not-allowed rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-300"
      >
        {trigger}
      </button>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-md border px-3 py-1.5 text-xs font-medium ${TRIGGER_TONE[tone]}`}
      >
        {trigger}
      </button>
    )
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      {Object.entries(hiddens).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <span className="text-xs text-gray-600">{message}</span>
      <ConfirmSubmit label={confirmLabel} tone={tone} />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white"
      >
        Annuler
      </button>
    </form>
  )
}
