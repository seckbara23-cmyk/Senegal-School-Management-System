'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { sendBroadcast, type BroadcastState } from './actions'

const field = 'block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'
const label = 'block text-sm font-medium text-gray-700 mb-1'
const CH_LABEL: Record<string, string> = { email: 'E-mail', sms: 'SMS', whatsapp: 'WhatsApp' }

function SendButton() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending} className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">{pending ? 'Envoi…' : 'Diffuser le message'}</button>
}

export function BroadcastForm({ enabledChannels }: { enabledChannels: string[] }) {
  const [state, formAction] = useFormState(sendBroadcast, {} as BroadcastState)
  const [audience, setAudience] = useState('parents')

  return (
    <form action={formAction} className="space-y-5 rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
      {state.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{state.error}</div>}

      <div>
        <span className={label}>Audience</span>
        <div className="flex flex-wrap gap-2">
          {[{ v: 'parents', l: 'Parents' }, { v: 'teachers', l: 'Enseignants' }, { v: 'all', l: 'Tous' }].map((o) => (
            <label key={o.v} className={`cursor-pointer rounded-lg border px-3.5 py-2 text-sm font-medium ${audience === o.v ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-700'}`}>
              <input type="radio" name="audience" value={o.v} checked={audience === o.v} onChange={() => setAudience(o.v)} className="sr-only" />{o.l}
            </label>
          ))}
        </div>
      </div>

      <div>
        <span className={label}>Canaux supplémentaires</span>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">In-app (toujours)</span>
          {enabledChannels.length === 0 && <span className="text-xs text-gray-400">Aucun autre canal activé.</span>}
          {enabledChannels.map((ch) => (
            <label key={ch} className="flex items-center gap-1.5 text-sm text-gray-700">
              <input type="checkbox" name="channels" value={ch} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600" />{CH_LABEL[ch] ?? ch}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-400">L’envoi par e-mail/SMS/WhatsApp respecte les préférences de chaque destinataire.</p>
      </div>

      <div>
        <label className={label} htmlFor="subject">Objet <span className="font-normal text-gray-400">(e-mail)</span></label>
        <input id="subject" name="subject" type="text" maxLength={300} className={field} />
      </div>
      <div>
        <label className={label} htmlFor="body">Message</label>
        <textarea id="body" name="body" rows={6} required maxLength={4000} className={field} />
      </div>

      <SendButton />
    </form>
  )
}
