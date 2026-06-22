'use client'

import { useFormState } from 'react-dom'
import { createDriver, updateDriver, type DriverFormState } from '../actions'
import { inputClass, FieldErrors, FormError, SubmitButton } from '../_form-ui'

export type DriverDefaults = {
  id?: string
  full_name?: string
  phone?: string | null
  address?: string | null
  license_number?: string | null
  license_expiry_date?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  status?: string
  notes?: string | null
}

const initialState: DriverFormState = {}

export function DriverForm({ mode, defaults = {} }: { mode: 'create' | 'edit'; defaults?: DriverDefaults }) {
  const action = mode === 'create' ? createDriver : updateDriver
  const [state, formAction] = useFormState(action, initialState)
  const e = state.errors
  const cancelHref = mode === 'edit' && defaults.id ? `/school/transport/drivers/${defaults.id}` : '/school/transport/drivers'

  return (
    <form action={formAction} noValidate className="space-y-5">
      {mode === 'edit' && defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <FormError errors={e?._form} />

      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-gray-700">
          Nom complet <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input id="full_name" name="full_name" type="text" required defaultValue={defaults.full_name ?? ''}
          autoComplete="name" aria-invalid={e?.full_name ? 'true' : undefined} aria-describedby="full_name-errors"
          className={inputClass(!!e?.full_name)} />
        <FieldErrors id="full_name-errors" errors={e?.full_name} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Téléphone</label>
          <input id="phone" name="phone" type="tel" defaultValue={defaults.phone ?? ''} autoComplete="tel" className={inputClass(!!e?.phone)} />
          <FieldErrors id="phone-errors" errors={e?.phone} />
        </div>
        <div>
          <label htmlFor="address" className="block text-sm font-medium text-gray-700">Adresse</label>
          <input id="address" name="address" type="text" defaultValue={defaults.address ?? ''} className={inputClass(!!e?.address)} />
          <FieldErrors id="address-errors" errors={e?.address} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="license_number" className="block text-sm font-medium text-gray-700">N° de permis</label>
          <input id="license_number" name="license_number" type="text" defaultValue={defaults.license_number ?? ''} className={inputClass(!!e?.license_number)} />
          <FieldErrors id="license_number-errors" errors={e?.license_number} />
        </div>
        <div>
          <label htmlFor="license_expiry_date" className="block text-sm font-medium text-gray-700">Permis — expiration</label>
          <input id="license_expiry_date" name="license_expiry_date" type="date" defaultValue={defaults.license_expiry_date ?? ''} className={inputClass(!!e?.license_expiry_date)} />
          <FieldErrors id="license_expiry_date-errors" errors={e?.license_expiry_date} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="emergency_contact_name" className="block text-sm font-medium text-gray-700">Contact d’urgence — nom</label>
          <input id="emergency_contact_name" name="emergency_contact_name" type="text" defaultValue={defaults.emergency_contact_name ?? ''} className={inputClass(!!e?.emergency_contact_name)} />
          <FieldErrors id="emergency_contact_name-errors" errors={e?.emergency_contact_name} />
        </div>
        <div>
          <label htmlFor="emergency_contact_phone" className="block text-sm font-medium text-gray-700">Contact d’urgence — téléphone</label>
          <input id="emergency_contact_phone" name="emergency_contact_phone" type="tel" defaultValue={defaults.emergency_contact_phone ?? ''} className={inputClass(!!e?.emergency_contact_phone)} />
          <FieldErrors id="emergency_contact_phone-errors" errors={e?.emergency_contact_phone} />
        </div>
      </div>

      <div>
        <label htmlFor="status" className="block text-sm font-medium text-gray-700">Statut</label>
        <select id="status" name="status" defaultValue={defaults.status ?? 'active'} className={inputClass(false)}>
          <option value="active">Actif</option>
          <option value="inactive">Inactif</option>
        </select>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notes</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={defaults.notes ?? ''} className={inputClass(!!e?.notes)} />
        <FieldErrors id="notes-errors" errors={e?.notes} />
      </div>

      <p className="text-xs text-gray-500"><span className="text-red-500" aria-hidden="true">*</span> Champs obligatoires</p>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        <SubmitButton label={mode === 'create' ? 'Ajouter le chauffeur' : 'Enregistrer les modifications'} />
        <a href={cancelHref} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</a>
      </div>
    </form>
  )
}
