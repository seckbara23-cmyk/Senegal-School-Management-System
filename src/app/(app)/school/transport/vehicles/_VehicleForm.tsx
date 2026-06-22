'use client'

import { useFormState } from 'react-dom'
import { createVehicle, updateVehicle, type VehicleFormState } from '../actions'
import { inputClass, FieldErrors, FormError, SubmitButton } from '../_form-ui'

export type VehicleDefaults = {
  id?: string
  name?: string
  registration_plate?: string
  make?: string | null
  model?: string | null
  capacity?: number
  status?: string
  insurance_expiry_date?: string | null
  inspection_expiry_date?: string | null
  notes?: string | null
}

const initialState: VehicleFormState = {}

export function VehicleForm({ mode, defaults = {} }: { mode: 'create' | 'edit'; defaults?: VehicleDefaults }) {
  const action = mode === 'create' ? createVehicle : updateVehicle
  const [state, formAction] = useFormState(action, initialState)
  const e = state.errors
  const cancelHref = mode === 'edit' && defaults.id
    ? `/school/transport/vehicles/${defaults.id}`
    : '/school/transport/vehicles'

  return (
    <form action={formAction} noValidate className="space-y-5">
      {mode === 'edit' && defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <FormError errors={e?._form} />

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Nom / désignation <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input id="name" name="name" type="text" required defaultValue={defaults.name ?? ''}
          placeholder="Bus 1 — Ligne Nord" aria-invalid={e?.name ? 'true' : undefined}
          aria-describedby="name-errors" className={inputClass(!!e?.name)} />
        <FieldErrors id="name-errors" errors={e?.name} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="registration_plate" className="block text-sm font-medium text-gray-700">
            Immatriculation <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <input id="registration_plate" name="registration_plate" type="text" required
            defaultValue={defaults.registration_plate ?? ''} placeholder="DK-1234-AB"
            aria-invalid={e?.registration_plate ? 'true' : undefined} aria-describedby="plate-errors"
            className={inputClass(!!e?.registration_plate)} />
          <FieldErrors id="plate-errors" errors={e?.registration_plate} />
        </div>
        <div>
          <label htmlFor="capacity" className="block text-sm font-medium text-gray-700">Capacité (places)</label>
          <input id="capacity" name="capacity" type="number" min={0} max={200}
            defaultValue={defaults.capacity ?? 0} aria-describedby="capacity-errors"
            className={inputClass(!!e?.capacity)} />
          <FieldErrors id="capacity-errors" errors={e?.capacity} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="make" className="block text-sm font-medium text-gray-700">Marque</label>
          <input id="make" name="make" type="text" defaultValue={defaults.make ?? ''}
            placeholder="Toyota" className={inputClass(!!e?.make)} />
          <FieldErrors id="make-errors" errors={e?.make} />
        </div>
        <div>
          <label htmlFor="model" className="block text-sm font-medium text-gray-700">Modèle</label>
          <input id="model" name="model" type="text" defaultValue={defaults.model ?? ''}
            placeholder="Coaster" className={inputClass(!!e?.model)} />
          <FieldErrors id="model-errors" errors={e?.model} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="insurance_expiry_date" className="block text-sm font-medium text-gray-700">
            Assurance — expiration
          </label>
          <input id="insurance_expiry_date" name="insurance_expiry_date" type="date"
            defaultValue={defaults.insurance_expiry_date ?? ''} className={inputClass(!!e?.insurance_expiry_date)} />
          <FieldErrors id="insurance-errors" errors={e?.insurance_expiry_date} />
        </div>
        <div>
          <label htmlFor="inspection_expiry_date" className="block text-sm font-medium text-gray-700">
            Visite technique — expiration
          </label>
          <input id="inspection_expiry_date" name="inspection_expiry_date" type="date"
            defaultValue={defaults.inspection_expiry_date ?? ''} className={inputClass(!!e?.inspection_expiry_date)} />
          <FieldErrors id="inspection-errors" errors={e?.inspection_expiry_date} />
        </div>
      </div>

      <div>
        <label htmlFor="status" className="block text-sm font-medium text-gray-700">Statut</label>
        <select id="status" name="status" defaultValue={defaults.status ?? 'active'} className={inputClass(false)}>
          <option value="active">Actif</option>
          <option value="maintenance">Maintenance</option>
          <option value="inactive">Inactif</option>
        </select>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notes</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={defaults.notes ?? ''}
          className={inputClass(!!e?.notes)} />
        <FieldErrors id="notes-errors" errors={e?.notes} />
      </div>

      <p className="text-xs text-gray-500"><span className="text-red-500" aria-hidden="true">*</span> Champs obligatoires</p>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        <SubmitButton label={mode === 'create' ? 'Ajouter le véhicule' : 'Enregistrer les modifications'} />
        <a href={cancelHref} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</a>
      </div>
    </form>
  )
}
