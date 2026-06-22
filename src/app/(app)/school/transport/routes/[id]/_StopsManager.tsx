'use client'

import { useState } from 'react'
import { createStop, updateStop, deleteStop } from '../../actions'
import { inputClass, SubmitButton } from '../../_form-ui'
import { fmtTime } from '@/lib/transport'

export type Stop = {
  id: string; name: string; pickup_time: string | null; dropoff_time: string | null
  stop_order: number; notes: string | null
}

function StopFields({ stop }: { stop?: Stop }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-gray-600">Nom de l’arrêt *</label>
        <input name="name" type="text" required defaultValue={stop?.name ?? ''} placeholder="Carrefour Liberté 6" className={inputClass(false)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600">Heure de ramassage</label>
        <input name="pickup_time" type="time" defaultValue={stop?.pickup_time?.slice(0, 5) ?? ''} className={inputClass(false)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600">Heure de dépose</label>
        <input name="dropoff_time" type="time" defaultValue={stop?.dropoff_time?.slice(0, 5) ?? ''} className={inputClass(false)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600">Ordre</label>
        <input name="stop_order" type="number" min={0} defaultValue={stop?.stop_order ?? 0} className={inputClass(false)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600">Notes</label>
        <input name="notes" type="text" defaultValue={stop?.notes ?? ''} className={inputClass(false)} />
      </div>
    </div>
  )
}

export function StopsManager({ routeId, stops, readOnly }: { routeId: string; stops: Stop[]; readOnly: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  return (
    <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-sand-200 bg-sand-50 px-5 py-3 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Arrêts ({stops.length})</p>
        {!readOnly && !adding && (
          <button onClick={() => { setAdding(true); setEditingId(null) }} className="rounded-lg border border-primary-200 px-3 py-1.5 text-xs font-semibold text-primary-600 hover:bg-primary-50 transition-colors">+ Ajouter un arrêt</button>
        )}
      </div>

      {adding && !readOnly && (
        <form action={createStop} className="border-b border-sand-200 bg-primary-50/40 px-5 py-4 space-y-3">
          <input type="hidden" name="route_id" value={routeId} />
          <StopFields />
          <div className="flex items-center gap-3">
            <SubmitButton label="Ajouter" pendingLabel="Ajout…" />
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</button>
          </div>
        </form>
      )}

      {stops.length === 0 && !adding ? (
        <p className="px-5 py-6 text-sm text-gray-500 text-center">Aucun arrêt défini pour cet itinéraire.</p>
      ) : (
        <ol className="divide-y divide-sand-100">
          {stops.map((s, i) => (
            <li key={s.id} className="px-5 py-3">
              {editingId === s.id && !readOnly ? (
                <form action={updateStop} className="space-y-3">
                  <input type="hidden" name="route_id" value={routeId} />
                  <input type="hidden" name="stop_id" value={s.id} />
                  <StopFields stop={s} />
                  <div className="flex items-center gap-3">
                    <SubmitButton label="Enregistrer" pendingLabel="Enregistrement…" />
                    <button type="button" onClick={() => setEditingId(null)} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary-700">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Ramassage {fmtTime(s.pickup_time)} · Dépose {fmtTime(s.dropoff_time)}
                      {s.notes ? ` · ${s.notes}` : ''}
                    </p>
                  </div>
                  {!readOnly && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => { setEditingId(s.id); setAdding(false) }} className="rounded-lg border border-sand-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-sand-50">Modifier</button>
                      <form action={deleteStop}>
                        <input type="hidden" name="route_id" value={routeId} />
                        <input type="hidden" name="stop_id" value={s.id} />
                        <button type="submit" className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Supprimer</button>
                      </form>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
