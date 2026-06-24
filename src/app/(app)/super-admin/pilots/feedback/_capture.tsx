'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createPilotFeedback, type FeedbackState } from './actions'

const field = 'block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'
const label = 'block text-sm font-medium text-gray-700 mb-1'

function Submit() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">{pending ? 'Enregistrement…' : 'Enregistrer le retour'}</button>
}

export function FeedbackCapture({ schools }: { schools: { id: string; name: string; is_pilot: boolean }[] }) {
  const [state, formAction] = useFormState(createPilotFeedback, {} as FeedbackState)
  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Enregistrer un retour</h2>
      {state.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{state.error}</div>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="fb_school">École</label>
          <select id="fb_school" name="school_id" required className={field} defaultValue="">
            <option value="" disabled>Choisir…</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.is_pilot ? '★ ' : ''}{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="fb_type">Type</label>
          <select id="fb_type" name="type" className={field} defaultValue="usability">
            <option value="bug">Bug / problème</option>
            <option value="usability">Ergonomie</option>
            <option value="feature">Suggestion</option>
            <option value="praise">Point positif</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="fb_subject">Résumé</label>
          <input id="fb_subject" name="subject" type="text" required maxLength={200} className={field} />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="fb_body">Détail <span className="font-normal text-gray-400">(facultatif)</span></label>
          <textarea id="fb_body" name="body" rows={3} maxLength={4000} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="fb_priority">Priorité</label>
          <select id="fb_priority" name="priority" className={field} defaultValue="normal">
            <option value="low">Basse</option><option value="normal">Normale</option><option value="high">Haute</option><option value="urgent">Urgente</option>
          </select>
        </div>
      </div>
      <Submit />
    </form>
  )
}
