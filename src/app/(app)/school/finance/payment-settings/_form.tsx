'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { savePaymentConfig, type PaymentConfigState } from './actions'

const field = 'block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'
const label = 'block text-sm font-medium text-gray-700 mb-1'

function SaveButton() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">{pending ? 'Enregistrement…' : 'Enregistrer'}</button>
}

export function ProviderConfigForm({ provider, providerLabel, config, webhookUrl, saved }: {
  provider: 'wave' | 'orange_money'
  providerLabel: string
  config: { isEnabled: boolean; mode: string; merchantId: string | null; hasApiKey: boolean; hasSecret: boolean }
  webhookUrl: string
  saved: boolean
}) {
  const [state, formAction] = useFormState(savePaymentConfig, {} as PaymentConfigState)
  const [enabled, setEnabled] = useState(config.isEnabled)

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
      <input type="hidden" name="provider" value={provider} />
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">{providerLabel}</h2>
        {config.isEnabled && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Activé</span>}
      </div>
      {saved && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-700">Paramètres enregistrés.</div>}
      {state.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{state.error}</div>}

      <label className="flex items-center gap-2">
        <input type="checkbox" name="is_enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600" />
        <span className="text-sm text-gray-800">Accepter les paiements {providerLabel} en ligne</span>
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor={`${provider}_mode`}>Environnement</label>
          <select id={`${provider}_mode`} name="mode" defaultValue={config.mode} className={field}>
            <option value="sandbox">Test (sandbox)</option>
            <option value="live">Production (live)</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`${provider}_merchant`}>Identifiant marchand</label>
          <input id={`${provider}_merchant`} name="merchant_id" type="text" defaultValue={config.merchantId ?? ''} maxLength={200} className={field} />
        </div>
        <div>
          <label className={label} htmlFor={`${provider}_key`}>Clé API {config.hasApiKey && <span className="font-normal text-emerald-600">· configurée</span>}</label>
          <input id={`${provider}_key`} name="api_key" type="password" autoComplete="off" placeholder={config.hasApiKey ? '•••••••• (laisser vide pour conserver)' : ''} maxLength={500} className={field} />
        </div>
        <div>
          <label className={label} htmlFor={`${provider}_secret`}>Secret du webhook {config.hasSecret && <span className="font-normal text-emerald-600">· configuré</span>}</label>
          <input id={`${provider}_secret`} name="webhook_secret" type="password" autoComplete="off" placeholder={config.hasSecret ? '•••••••• (laisser vide pour conserver)' : ''} maxLength={500} className={field} />
        </div>
      </div>

      <div className="rounded-lg border border-sand-200 bg-sand-50 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">URL du webhook (à configurer chez {providerLabel})</p>
        <p className="mt-1 break-all font-mono text-xs text-gray-700">{webhookUrl}</p>
      </div>

      <SaveButton />
    </form>
  )
}
