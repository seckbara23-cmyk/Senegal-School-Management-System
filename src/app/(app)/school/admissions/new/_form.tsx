'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createAdmission, type AdmissionState } from '../actions'

export type ClassOpt = { id: string; label: string }
export type YearOpt = { id: string; label: string }

function inputClass(hasError: boolean): string {
  return 'mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ' +
    (hasError ? 'border-red-400 text-red-900 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 text-gray-900 focus:border-primary-600 focus:ring-primary-600')
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null
  return <p className="mt-1 text-xs text-red-600">{errors[0]}</p>
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
    >
      {pending ? 'Enregistrement…' : 'Créer la candidature'}
    </button>
  )
}

const initialState: AdmissionState = {}

export function NewAdmissionForm({ classes, years }: { classes: ClassOpt[]; years: YearOpt[] }) {
  const [state, formAction] = useFormState(createAdmission, initialState)

  return (
    <form action={formAction} noValidate className="space-y-5">

      {state.errors?._form && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((m, i) => <p key={i} className="text-sm text-red-700">{m}</p>)}
        </div>
      )}

      {/* Applicant identity */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="last_name" className="block text-sm font-medium text-gray-700">Nom <span className="text-red-500">*</span></label>
          <input id="last_name" name="last_name" type="text" required className={inputClass(!!state.errors?.last_name)} />
          <FieldError errors={state.errors?.last_name} />
        </div>
        <div>
          <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">Prénom <span className="text-red-500">*</span></label>
          <input id="first_name" name="first_name" type="text" required className={inputClass(!!state.errors?.first_name)} />
          <FieldError errors={state.errors?.first_name} />
        </div>
        <div>
          <label htmlFor="gender" className="block text-sm font-medium text-gray-700">Sexe <span className="font-normal text-gray-400">(optionnel)</span></label>
          <select id="gender" name="gender" defaultValue="" className={inputClass(false)}>
            <option value="">—</option>
            <option value="male">Masculin</option>
            <option value="female">Féminin</option>
            <option value="other">Autre</option>
          </select>
        </div>
        <div>
          <label htmlFor="date_of_birth" className="block text-sm font-medium text-gray-700">Date de naissance <span className="font-normal text-gray-400">(optionnel)</span></label>
          <input id="date_of_birth" name="date_of_birth" type="date" className={inputClass(!!state.errors?.date_of_birth)} />
          <FieldError errors={state.errors?.date_of_birth} />
        </div>
      </div>

      {/* Guardian */}
      <div className="border-t border-sand-100 pt-4">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Tuteur / parent</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="guardian_name" className="block text-sm font-medium text-gray-700">Nom</label>
            <input id="guardian_name" name="guardian_name" type="text" className={inputClass(false)} />
          </div>
          <div>
            <label htmlFor="guardian_phone" className="block text-sm font-medium text-gray-700">Téléphone</label>
            <input id="guardian_phone" name="guardian_phone" type="tel" className={inputClass(false)} />
          </div>
          <div>
            <label htmlFor="guardian_email" className="block text-sm font-medium text-gray-700">Email</label>
            <input id="guardian_email" name="guardian_email" type="email" className={inputClass(!!state.errors?.guardian_email)} />
            <FieldError errors={state.errors?.guardian_email} />
          </div>
        </div>
      </div>

      {/* Campaign / target */}
      <div className="border-t border-sand-100 pt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="desired_class_id" className="block text-sm font-medium text-gray-700">Classe visée <span className="font-normal text-gray-400">(optionnel)</span></label>
          <select id="desired_class_id" name="desired_class_id" defaultValue="" className={inputClass(!!state.errors?.desired_class_id)}>
            <option value="">— Indéterminée —</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <FieldError errors={state.errors?.desired_class_id} />
        </div>
        <div>
          <label htmlFor="academic_year_id" className="block text-sm font-medium text-gray-700">Année (campagne) <span className="font-normal text-gray-400">(optionnel)</span></label>
          <select id="academic_year_id" name="academic_year_id" defaultValue="" className={inputClass(false)}>
            <option value="">—</option>
            {years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
          </select>
          <p className="mt-1 text-xs text-gray-400">Ignorée si une classe visée est choisie (l&apos;année en découle).</p>
        </div>
      </div>

      {/* Documents + notes */}
      <div>
        <label htmlFor="documents" className="block text-sm font-medium text-gray-700">Documents reçus <span className="font-normal text-gray-400">(optionnel)</span></label>
        <textarea id="documents" name="documents" rows={2} placeholder="ex. Acte de naissance, bulletin précédent, photo…" className={inputClass(false)} />
      </div>
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notes <span className="font-normal text-gray-400">(optionnel)</span></label>
        <textarea id="notes" name="notes" rows={2} className={inputClass(false)} />
      </div>

      {/* Initial status */}
      <div>
        <label htmlFor="status" className="block text-sm font-medium text-gray-700">Statut initial</label>
        <select id="status" name="status" defaultValue="submitted" className={inputClass(false)}>
          <option value="submitted">Soumise</option>
          <option value="draft">Brouillon</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-sand-100 pt-4">
        <SubmitButton />
        <a href="/school/admissions" className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</a>
      </div>
    </form>
  )
}
