'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { startThreadTeacher, type MsgState } from '../actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">
      {pending ? 'Envoi…' : 'Envoyer'}
    </button>
  )
}

const field = 'block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'
const label = 'block text-sm font-medium text-gray-700 mb-1'

export function NewTeacherMessageForm({ options }: { options: { value: string; label: string }[] }) {
  const [state, formAction] = useFormState(startThreadTeacher, {} as MsgState)
  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
      {state.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</div>}

      <div>
        <label className={label} htmlFor="pair">Destinataire</label>
        <select id="pair" name="pair" required defaultValue="" className={field}>
          <option value="" disabled>Sélectionnez un parent…</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div>
        <label className={label} htmlFor="subject">Sujet <span className="font-normal text-gray-400">(facultatif)</span></label>
        <input id="subject" name="subject" type="text" maxLength={150} placeholder="Ex. Comportement en classe" className={field} />
      </div>

      <div>
        <label className={label} htmlFor="body">Message</label>
        <textarea id="body" name="body" required rows={5} maxLength={4000} placeholder="Votre message…" className={field} />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <SubmitButton />
        <a href="/teacher/messages" className="text-sm text-gray-600 hover:underline">Annuler</a>
      </div>
    </form>
  )
}
