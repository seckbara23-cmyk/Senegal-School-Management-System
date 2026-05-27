'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useState }                    from 'react'
import { generatePasswordResetLink, type GenerateResetLinkState } from './actions'

const initialState: GenerateResetLinkState = {}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Génération…' : 'Générer un lien'}
    </button>
  )
}

type Props = {
  userId: string
}

export function ResetPasswordForm({ userId }: Props) {
  const [state, action] = useFormState(generatePasswordResetLink, initialState)
  const [copied, setCopied]  = useState(false)

  async function copyLink() {
    if (!state.link) return
    await navigator.clipboard.writeText(state.link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (state.link) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Lien valable une seule fois — transmettez-le directement et de manière sécurisée à l&apos;utilisateur.
        </p>
        <div className="flex items-start gap-2">
          <textarea
            readOnly
            value={state.link}
            rows={3}
            className="flex-1 resize-none rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-mono text-gray-700 shadow-sm focus:outline-none"
          />
          <button
            type="button"
            onClick={copyLink}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {copied ? '✓ Copié' : 'Copier'}
          </button>
        </div>
        <form action={action}>
          <input type="hidden" name="user_id" value={userId} />
          <button type="submit" className="text-xs text-primary-600 hover:underline">
            Générer un nouveau lien
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {state.errors?._form && (
        <p className="text-sm text-red-600">{state.errors._form[0]}</p>
      )}
      <form action={action}>
        <input type="hidden" name="user_id" value={userId} />
        <SubmitButton />
      </form>
    </div>
  )
}
