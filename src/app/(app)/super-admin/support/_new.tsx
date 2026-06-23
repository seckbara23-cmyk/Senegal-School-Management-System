'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createTicket, type TicketState } from './actions'

const field = 'block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'

function SubmitButton() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">{pending ? 'Création…' : 'Créer le ticket'}</button>
}

export function NewTicketForm({ schools }: { schools: { id: string; name: string }[] }) {
  const [state, formAction] = useFormState(createTicket, {} as TicketState)
  const [open, setOpen] = useState(false)

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400">+ Nouveau ticket</button>

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
      {state.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{state.error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <select name="school_id" required defaultValue="" className={field}>
          <option value="" disabled>École…</option>
          {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select name="priority" defaultValue="normal" className={field}>
          <option value="low">Priorité basse</option><option value="normal">Normale</option><option value="high">Haute</option><option value="urgent">Urgente</option>
        </select>
      </div>
      <input name="subject" required maxLength={200} placeholder="Sujet" className={field} />
      <textarea name="body" rows={3} maxLength={4000} placeholder="Description (facultatif)" className={field} />
      <div className="flex items-center gap-3"><SubmitButton /><button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-500 hover:underline">Annuler</button></div>
    </form>
  )
}
