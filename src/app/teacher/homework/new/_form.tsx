'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createHomework, type HomeworkState } from '../actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">
      {pending ? 'Publication…' : 'Publier le devoir'}
    </button>
  )
}

const field = 'block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'
const label = 'block text-sm font-medium text-gray-700 mb-1'

export function NewHomeworkForm({ options }: { options: { id: string; label: string }[] }) {
  const [state, formAction] = useFormState(createHomework, {} as HomeworkState)

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
      {state.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</div>}

      <div>
        <label className={label} htmlFor="class_subject_id">Matière &amp; classe</label>
        <select id="class_subject_id" name="class_subject_id" required defaultValue="" className={field}>
          <option value="" disabled>Sélectionnez…</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>

      <div>
        <label className={label} htmlFor="title">Titre</label>
        <input id="title" name="title" type="text" required maxLength={200} placeholder="Ex. Exercices 4 à 7 page 32" className={field} />
      </div>

      <div>
        <label className={label} htmlFor="description">Consignes <span className="font-normal text-gray-400">(facultatif)</span></label>
        <textarea id="description" name="description" rows={4} maxLength={4000} placeholder="Détails, chapitres, ressources…" className={field} />
      </div>

      <div>
        <label className={label} htmlFor="due_date">À rendre le <span className="font-normal text-gray-400">(facultatif)</span></label>
        <input id="due_date" name="due_date" type="date" className={field} />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <SubmitButton />
        <a href="/teacher/homework" className="text-sm text-gray-600 hover:underline">Annuler</a>
      </div>
    </form>
  )
}
