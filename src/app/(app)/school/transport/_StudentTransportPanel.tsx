'use client'

import { useState } from 'react'
import { assignStudentTransport, endStudentTransport } from './actions'
import { inputClass, SubmitButton } from './_form-ui'
import { fmtFCFA, fmtDate } from '@/lib/transport'

export type CurrentAssignment = {
  id: string; route_id: string; route_name: string; stop_name: string | null
  monthly_fee: number; start_date: string | null
} | null

export type RouteOption = { id: string; name: string; monthly_fee: number; stops: { id: string; name: string }[] }

export function StudentTransportPanel({
  studentId, assignment, routes, writable,
}: {
  studentId: string; assignment: CurrentAssignment; routes: RouteOption[]; writable: boolean
}) {
  const [routeId, setRouteId] = useState('')
  const selected = routes.find((r) => r.id === routeId)
  const [fee, setFee] = useState<number | ''>('')

  return (
    <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-sand-200 bg-sand-50 px-5 py-3">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Transport scolaire</p>
      </div>

      {assignment ? (
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                <a href={`/school/transport/routes/${assignment.route_id}`} className="hover:text-primary-600 hover:underline">{assignment.route_name}</a>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Arrêt {assignment.stop_name ?? '—'} · {fmtFCFA(assignment.monthly_fee)}/mois
                {assignment.start_date ? ` · depuis ${fmtDate(assignment.start_date)}` : ''}
              </p>
            </div>
            {writable && (
              <form action={endStudentTransport}>
                <input type="hidden" name="assignment_id" value={assignment.id} />
                <input type="hidden" name="student_id" value={studentId} />
                <input type="hidden" name="route_id" value={assignment.route_id} />
                <input type="hidden" name="redirect_to" value="student" />
                <button type="submit" className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Terminer l’affectation</button>
              </form>
            )}
          </div>
        </div>
      ) : !writable ? (
        <p className="px-5 py-4 text-sm text-gray-500">Aucune affectation de transport.</p>
      ) : routes.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-500">Aucun itinéraire actif. Créez d’abord un itinéraire dans le module Transport.</p>
      ) : (
        <form action={assignStudentTransport} className="px-5 py-4 space-y-3">
          <input type="hidden" name="student_id" value={studentId} />
          <input type="hidden" name="redirect_to" value="student" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600">Itinéraire *</label>
              <select name="route_id" required value={routeId}
                onChange={(ev) => { setRouteId(ev.target.value); const r = routes.find((x) => x.id === ev.target.value); setFee(r ? r.monthly_fee : '') }}
                className={inputClass(false)}>
                <option value="" disabled>— Choisir un itinéraire —</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Arrêt de ramassage</label>
              <select name="stop_id" defaultValue="" className={inputClass(false)} disabled={!selected}>
                <option value="">— Aucun —</option>
                {selected?.stops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Frais mensuel (FCFA)</label>
              <input name="monthly_fee" type="number" min={0} step={1} value={fee} onChange={(ev) => setFee(ev.target.value === '' ? '' : Number(ev.target.value))} className={inputClass(false)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Date de début</label>
              <input name="start_date" type="date" className={inputClass(false)} />
            </div>
          </div>
          <SubmitButton label="Affecter au transport" pendingLabel="Affectation…" />
        </form>
      )}
    </div>
  )
}
