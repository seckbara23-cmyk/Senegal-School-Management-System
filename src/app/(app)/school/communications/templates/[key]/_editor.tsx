'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { saveTemplate, resetTemplate, type TemplateState } from '../actions'

const CH_LABEL: Record<string, string> = { in_app: 'In-app', email: 'E-mail', sms: 'SMS', whatsapp: 'WhatsApp' }
const SAMPLE: Record<string, string> = {
  school_name: 'École Exemple', student_name: 'Awa Diop', amount: '50 000 FCFA', due_clause: ' (échéance le 30 juin)', status: 'absente', date: '24 juin', name: 'M. Diop',
}
const field = 'block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'

function interpolate(s: string): string { return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => SAMPLE[k] ?? `{{${k}}}`) }

function SaveButton() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">{pending ? 'Enregistrement…' : 'Enregistrer'}</button>
}

export function TemplateEditor({ templateKey, channel, platformSubject, platformBody, overrideSubject, overrideBody, hasOverride }: {
  templateKey: string; channel: string; platformSubject: string | null; platformBody: string; overrideSubject: string | null; overrideBody: string | null; hasOverride: boolean
}) {
  const [state, formAction] = useFormState(saveTemplate, {} as TemplateState)
  const usesSubject = channel === 'email'
  const [subject, setSubject] = useState(overrideSubject ?? platformSubject ?? '')
  const [body, setBody] = useState(overrideBody ?? platformBody)

  return (
    <div className="space-y-4 rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">{CH_LABEL[channel] ?? channel}</h2>
        {hasOverride ? <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700">Personnalisé</span> : <span className="text-xs text-gray-400">Modèle par défaut</span>}
      </div>
      {state.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{state.error}</div>}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="key" value={templateKey} />
        <input type="hidden" name="channel" value={channel} />
        {usesSubject && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={`subj_${channel}`}>Objet</label>
            <input id={`subj_${channel}`} name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} className={field} />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={`body_${channel}`}>Contenu</label>
          <textarea id={`body_${channel}`} name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={channel === 'sms' ? 3 : 6} maxLength={4000} className={`${field} font-mono`} />
        </div>

        <div className="rounded-lg border border-sand-200 bg-sand-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Aperçu (données d’exemple)</p>
          {usesSubject && subject && <p className="mt-1.5 text-sm font-semibold text-gray-900">{interpolate(subject)}</p>}
          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{interpolate(body)}</p>
        </div>

        <div className="flex items-center gap-2">
          <SaveButton />
          {hasOverride && (
            <button type="submit" formAction={resetTemplate} className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-sand-50">Réinitialiser</button>
          )}
        </div>
      </form>
    </div>
  )
}
