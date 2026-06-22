'use client'

import { useFormState } from 'react-dom'
import { createRoute, updateRoute, type RouteFormState } from '../actions'
import { inputClass, FieldErrors, FormError, SubmitButton } from '../_form-ui'

export type RouteDefaults = {
  id?: string
  name?: string
  description?: string | null
  vehicle_id?: string | null
  driver_id?: string | null
  status?: string
  monthly_fee?: number
}

type Option = { id: string; label: string }

const initialState: RouteFormState = {}

export function RouteForm({
  mode, defaults = {}, vehicles, drivers,
}: {
  mode: 'create' | 'edit'; defaults?: RouteDefaults; vehicles: Option[]; drivers: Option[]
}) {
  const action = mode === 'create' ? createRoute : updateRoute
  const [state, formAction] = useFormState(action, initialState)
  const e = state.errors
  const cancelHref = mode === 'edit' && defaults.id ? `/school/transport/routes/${defaults.id}` : '/school/transport/routes'

  return (
    <form action={formAction} noValidate className="space-y-5">
      {mode === 'edit' && defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <FormError errors={e?._form} />

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Nom de l’itinéraire <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input id="name" name="name" type="text" required defaultValue={defaults.name ?? ''}
          placeholder="Ligne Nord — Parcelles" aria-invalid={e?.name ? 'true' : undefined} aria-describedby="name-errors"
          className={inputClass(!!e?.name)} />
        <FieldErrors id="name-errors" errors={e?.name} />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
        <textarea id="description" name="description" rows={2} defaultValue={defaults.description ?? ''} className={inputClass(!!e?.description)} />
        <FieldErrors id="description-errors" errors={e?.description} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="vehicle_id" className="block text-sm font-medium text-gray-700">Véhicule</label>
          <select id="vehicle_id" name="vehicle_id" defaultValue={defaults.vehicle_id ?? ''} className={inputClass(!!e?.vehicle_id)}>
            <option value="">— Aucun —</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
          <FieldErrors id="vehicle_id-errors" errors={e?.vehicle_id} />
        </div>
        <div>
          <label htmlFor="driver_id" className="block text-sm font-medium text-gray-700">Chauffeur</label>
          <select id="driver_id" name="driver_id" defaultValue={defaults.driver_id ?? ''} className={inputClass(!!e?.driver_id)}>
            <option value="">— Aucun —</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <FieldErrors id="driver_id-errors" errors={e?.driver_id} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="monthly_fee" className="block text-sm font-medium text-gray-700">Frais mensuel (FCFA)</label>
          <input id="monthly_fee" name="monthly_fee" type="number" min={0} step={1} defaultValue={defaults.monthly_fee ?? 0} className={inputClass(!!e?.monthly_fee)} />
          <p className="text-xs text-gray-500 mt-1">Montant par défaut proposé lors de l’affectation d’un élève.</p>
          <FieldErrors id="monthly_fee-errors" errors={e?.monthly_fee} />
        </div>
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700">Statut</label>
          <select id="status" name="status" defaultValue={defaults.status ?? 'active'} className={inputClass(false)}>
            <option value="active">Actif</option>
            <option value="inactive">Inactif</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-gray-500"><span className="text-red-500" aria-hidden="true">*</span> Champs obligatoires</p>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        <SubmitButton label={mode === 'create' ? 'Créer l’itinéraire' : 'Enregistrer les modifications'} />
        <a href={cancelHref} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</a>
      </div>
    </form>
  )
}
