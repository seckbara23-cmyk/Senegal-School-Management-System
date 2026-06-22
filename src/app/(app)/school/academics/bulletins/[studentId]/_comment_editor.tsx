'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { generateBulletinComment, type CommentInput } from '@/lib/academic/bulletin-comments'
import { approveBulletinComment, type CommentState } from '../actions'

type Metrics = Omit<CommentInput, 'variant' | 'locale'>

function AcceptButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending || disabled}
      className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
      {pending ? 'Enregistrement…' : 'Accepter'}
    </button>
  )
}

export function BulletinCommentEditor({
  studentId, periodId, locale = 'fr', metrics, existingApproved,
}: {
  studentId: string; periodId: string; locale?: 'fr' | 'wo' | 'en'; metrics: Metrics; existingApproved: string | null
}) {
  const [state, formAction] = useFormState(approveBulletinComment, {} as CommentState)
  const [editing, setEditing] = useState(!existingApproved)
  const [variant, setVariant] = useState(0)
  const [suggestion, setSuggestion] = useState('')
  const [text, setText] = useState(existingApproved ?? '')

  function generate(nextVariant: number) {
    const s = generateBulletinComment({ ...metrics, locale, variant: nextVariant })
    setSuggestion(s); setText(s); setVariant(nextVariant)
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        <p className="whitespace-pre-wrap text-sm text-gray-800">{existingApproved}</p>
        <button type="button" onClick={() => setEditing(true)}
          className="rounded-lg border border-sand-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-sand-50 transition-colors">
          Modifier
        </button>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="period_id" value={periodId} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="generated_text" value={suggestion} />

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => generate(0)}
          className="rounded-lg bg-accent-300 px-3 py-1.5 text-xs font-semibold text-primary-800 hover:bg-accent-400 transition-colors">
          ✨ Générer une appréciation
        </button>
        <button type="button" onClick={() => generate(variant + 1)} disabled={!suggestion}
          className="rounded-lg border border-sand-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-sand-50 disabled:opacity-50 transition-colors">
          Régénérer
        </button>
      </div>

      <textarea name="approved_text" value={text} onChange={(e) => setText(e.target.value)} rows={4} required
        placeholder="Cliquez sur « Générer » pour une proposition, puis relisez et modifiez avant d'accepter…"
        className="block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600" />

      {state.errors?._form && <p className="text-sm text-red-700">{state.errors._form.join(' ')}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <AcceptButton disabled={!text.trim()} />
        {existingApproved && (
          <button type="button" onClick={() => { setEditing(false); setText(existingApproved) }} className="text-xs text-gray-600 hover:underline">Annuler</button>
        )}
        <span className="text-[11px] text-gray-400">L&apos;IA propose à partir des données réelles de l&apos;élève — relisez avant d&apos;accepter. Rien n&apos;est publié automatiquement.</span>
      </div>
    </form>
  )
}
