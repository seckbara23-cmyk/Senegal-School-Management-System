'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { updateSchool, type EditSchoolState } from '../../actions'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inputClass(hasError: boolean): string {
  return (
    'mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ' +
    (hasError
      ? 'border-red-400 text-red-900 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 text-gray-900 focus:border-indigo-500 focus:ring-indigo-500')
  )
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) return null
  return <p className="mt-1 text-xs text-red-600">{errors[0]}</p>
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Enregistrement…' : 'Enregistrer les modifications'}
    </button>
  )
}

export type SchoolFormValues = {
  id:                string
  name:              string
  slug:              string
  address:           string | null
  phone:             string | null
  email:             string | null
  subscription_plan: string
  trial_ends_at:     string | null
}

const PLAN_OPTIONS: { value: string; label: string }[] = [
  { value: 'starter',  label: 'Starter' },
  { value: 'standard', label: 'Standard' },
  { value: 'premium',  label: 'Premium' },
]

const initialState: EditSchoolState = {}

// ─── Form ─────────────────────────────────────────────────────────────────────

export function EditSchoolForm({ school }: { school: SchoolFormValues }) {
  const [state, formAction] = useFormState(updateSchool, initialState)

  return (
    <form action={formAction} noValidate className="space-y-8">
      <input type="hidden" name="school_id" value={school.id} />

      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((m, i) => <p key={i} className="text-sm text-red-700">{m}</p>)}
        </div>
      )}

      {/* ── Section 1: Profile ─────────────────────────────────────────────── */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-gray-500">1 · Établissement</legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nom de l&apos;école <span className="text-red-500">*</span></label>
            <input
              id="name" name="name" type="text" required defaultValue={school.name}
              className={inputClass(!!state.errors?.name)}
            />
            <FieldError errors={state.errors?.name} />
          </div>

          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-gray-700">Identifiant (slug) <span className="text-red-500">*</span></label>
            <input
              id="slug" name="slug" type="text" required defaultValue={school.slug}
              className={`${inputClass(!!state.errors?.slug)} font-mono`}
            />
            <FieldError errors={state.errors?.slug} />
            <p className="mt-1 text-xs text-gray-400">Lettres minuscules, chiffres et tirets. Doit rester unique.</p>
          </div>
        </div>

        <div>
          <label htmlFor="address" className="block text-sm font-medium text-gray-700">Adresse</label>
          <input id="address" name="address" type="text" defaultValue={school.address ?? ''} className={inputClass(!!state.errors?.address)} />
          <FieldError errors={state.errors?.address} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Téléphone</label>
            <input id="phone" name="phone" type="tel" defaultValue={school.phone ?? ''} placeholder="+221 …" className={inputClass(!!state.errors?.phone)} />
            <FieldError errors={state.errors?.phone} />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email de l&apos;école</label>
            <input id="email" name="email" type="email" defaultValue={school.email ?? ''} placeholder="contact@ecole.sn" className={inputClass(!!state.errors?.email)} />
            <FieldError errors={state.errors?.email} />
          </div>
        </div>
      </fieldset>

      {/* ── Section 2: Subscription ────────────────────────────────────────── */}
      <fieldset className="space-y-4 border-t border-gray-100 pt-6">
        <legend className="text-sm font-semibold uppercase tracking-wide text-gray-500">2 · Abonnement</legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="subscription_plan" className="block text-sm font-medium text-gray-700">Formule</label>
            <select id="subscription_plan" name="subscription_plan" defaultValue={school.subscription_plan} className={inputClass(!!state.errors?.subscription_plan)}>
              {PLAN_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <FieldError errors={state.errors?.subscription_plan} />
          </div>
          <div>
            <label htmlFor="trial_ends_at" className="block text-sm font-medium text-gray-700">Fin de la période d&apos;essai</label>
            <input id="trial_ends_at" name="trial_ends_at" type="date" defaultValue={school.trial_ends_at ?? ''} className={inputClass(!!state.errors?.trial_ends_at)} />
            <FieldError errors={state.errors?.trial_ends_at} />
            <p className="mt-1 text-xs text-gray-400">Optionnel. Laisser vide si aucune période d&apos;essai.</p>
          </div>
        </div>

        <p className="text-xs text-gray-400">
          Le statut du cycle de vie (active, suspendue, archivée) se gère depuis les actions dédiées sur la fiche de l&apos;école.
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
        <SubmitButton />
        <a href={`/super-admin/schools/${school.id}`} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</a>
      </div>
    </form>
  )
}
