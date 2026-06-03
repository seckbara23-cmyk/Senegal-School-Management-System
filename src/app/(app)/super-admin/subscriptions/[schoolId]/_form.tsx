'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { updateSubscription, type SubscriptionEditState } from '../actions'

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
      {pending ? 'Enregistrement…' : "Enregistrer l'abonnement"}
    </button>
  )
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'trialing',  label: 'Essai' },
  { value: 'active',    label: 'Active' },
  { value: 'past_due',  label: 'Impayé' },
  { value: 'suspended', label: 'Suspendu' },
  { value: 'cancelled', label: 'Annulé' },
]

export type SubscriptionFormValues = {
  school_id:            string
  plan_id:              string
  status:               string
  trial_ends_at:        string  // YYYY-MM-DD or ''
  current_period_start: string
  current_period_end:   string
}

const initialState: SubscriptionEditState = {}

export function EditSubscriptionForm({
  values,
  plans,
}: {
  values: SubscriptionFormValues
  plans: { id: string; name: string; is_active: boolean }[]
}) {
  const [state, formAction] = useFormState(updateSubscription, initialState)

  return (
    <form action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="school_id" value={values.school_id} />

      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((m, i) => <p key={i} className="text-sm text-red-700">{m}</p>)}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="plan_id" className="block text-sm font-medium text-gray-700">Formule</label>
          <select id="plan_id" name="plan_id" defaultValue={values.plan_id} className={inputClass(!!state.errors?.plan_id)}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.is_active ? '' : ' (inactive)'}</option>
            ))}
          </select>
          <FieldError errors={state.errors?.plan_id} />
        </div>
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700">Statut de facturation</label>
          <select id="status" name="status" defaultValue={values.status} className={inputClass(!!state.errors?.status)}>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <FieldError errors={state.errors?.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="trial_ends_at" className="block text-sm font-medium text-gray-700">Fin d&apos;essai</label>
          <input id="trial_ends_at" name="trial_ends_at" type="date" defaultValue={values.trial_ends_at} className={inputClass(!!state.errors?.trial_ends_at)} />
          <FieldError errors={state.errors?.trial_ends_at} />
        </div>
        <div>
          <label htmlFor="current_period_start" className="block text-sm font-medium text-gray-700">Début de période</label>
          <input id="current_period_start" name="current_period_start" type="date" defaultValue={values.current_period_start} className={inputClass(!!state.errors?.current_period_start)} />
          <FieldError errors={state.errors?.current_period_start} />
        </div>
        <div>
          <label htmlFor="current_period_end" className="block text-sm font-medium text-gray-700">Fin de période</label>
          <input id="current_period_end" name="current_period_end" type="date" defaultValue={values.current_period_end} className={inputClass(!!state.errors?.current_period_end)} />
          <FieldError errors={state.errors?.current_period_end} />
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Les dates sont optionnelles. Passer le statut à « Annulé » renseigne automatiquement la date
        d&apos;annulation ; en repasser le supprime.
      </p>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
        <SubmitButton />
        <a href={`/super-admin/subscriptions`} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Retour à la liste</a>
      </div>
    </form>
  )
}
