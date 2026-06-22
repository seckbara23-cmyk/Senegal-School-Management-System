'use client'

import { useState } from 'react'
import { assignStudentTransport } from '../../actions'
import { inputClass, SubmitButton } from '../../_form-ui'

type Student = { id: string; label: string }
type Stop = { id: string; name: string }

export function AssignOnRoute({
  routeId, routeFee, stops, students, readOnly,
}: {
  routeId: string; routeFee: number; stops: Stop[]; students: Student[]; readOnly: boolean
}) {
  const [open, setOpen] = useState(false)

  if (readOnly) return null

  if (students.length === 0) {
    return (
      <p className="rounded-lg border border-sand-200 bg-sand-50 px-4 py-3 text-sm text-gray-500">
        Tous les élèves actifs ont déjà une affectation de transport.
      </p>
    )
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors">
        + Affecter un élève
      </button>
    )
  }

  return (
    <form action={assignStudentTransport} className="rounded-xl border border-primary-200 bg-primary-50/40 px-5 py-4 space-y-3">
      <input type="hidden" name="route_id" value={routeId} />
      <input type="hidden" name="redirect_to" value="route" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600">Élève *</label>
          <select name="student_id" required defaultValue="" className={inputClass(false)}>
            <option value="" disabled>— Choisir un élève —</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Arrêt de ramassage</label>
          <select name="stop_id" defaultValue="" className={inputClass(false)}>
            <option value="">— Aucun —</option>
            {stops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Frais mensuel (FCFA)</label>
          <input name="monthly_fee" type="number" min={0} step={1} defaultValue={routeFee} className={inputClass(false)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Date de début</label>
          <input name="start_date" type="date" className={inputClass(false)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Notes</label>
          <input name="notes" type="text" className={inputClass(false)} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton label="Affecter" pendingLabel="Affectation…" />
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</button>
      </div>
    </form>
  )
}
