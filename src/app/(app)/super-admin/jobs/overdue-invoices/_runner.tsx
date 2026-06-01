'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { runOverdueInvoicesJob, type OverdueJobState } from './actions'

const initialState: OverdueJobState = {}

function RunButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Exécution en cours…' : 'Exécuter le job'}
    </button>
  )
}

function Stat({ label, value, tone = 'gray' }: { label: string; value: number; tone?: 'gray' | 'indigo' | 'amber' }) {
  const toneClass =
    tone === 'indigo' ? 'text-indigo-700'
    : tone === 'amber' ? 'text-amber-700'
    : 'text-gray-900'
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-center">
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
    </div>
  )
}

export function OverdueJobRunner() {
  const [state, formAction] = useFormState(runOverdueInvoicesJob, initialState)

  return (
    <div className="space-y-5">
      <form action={formAction}>
        <RunButton />
      </form>

      {state.error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      {state.summary && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Dernière exécution :{' '}
            {state.ranAt ? new Date(state.ranAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Factures traitées"   value={state.summary.invoicesProcessed} />
            <Stat label="Notifications envoyées" value={state.summary.notificationsSent} tone="indigo" />
            <Stat label="Ignorées (déjà notifiées)" value={state.summary.notificationsSkipped} tone="amber" />
            <Stat label="Sans destinataire"   value={state.summary.invoicesWithoutRecipients} />
          </div>
        </div>
      )}
    </div>
  )
}
