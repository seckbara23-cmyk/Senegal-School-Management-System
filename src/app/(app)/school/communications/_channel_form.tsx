'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { saveChannelConfig, sendTestMessage, type ChannelConfigState } from './actions'

const field = 'block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'
const label = 'block text-sm font-medium text-gray-700 mb-1'

function SaveButton() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">{pending ? 'Enregistrement…' : 'Enregistrer'}</button>
}

export function ChannelConfigForm({ channel, channelLabel, providers, config, webhookUrl, active, saved }: {
  channel: 'email' | 'sms' | 'whatsapp'
  channelLabel: string
  providers: { code: string; label: string }[]
  config: { isEnabled: boolean; mode: string; providerCode: string | null; senderId: string | null; hasApiKey: boolean; hasSecret: boolean }
  webhookUrl: string
  active: boolean
  saved: boolean
}) {
  const [state, formAction] = useFormState(saveChannelConfig, {} as ChannelConfigState)
  const [enabled, setEnabled] = useState(config.isEnabled)

  return (
    <div className="space-y-4 rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">{channelLabel}</h2>
        <div className="flex items-center gap-2">
          {config.isEnabled && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Activé</span>}
          {!active && <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Fournisseur bientôt</span>}
        </div>
      </div>
      {saved && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-700">Paramètres enregistrés.</div>}
      {state.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{state.error}</div>}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="channel" value={channel} />
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600" />
          <span className="text-sm text-gray-800">Activer ce canal</span>
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor={`${channel}_provider`}>Fournisseur</label>
            <select id={`${channel}_provider`} name="provider_code" defaultValue={config.providerCode ?? (providers[0]?.code ?? '')} className={field}>
              {providers.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor={`${channel}_mode`}>Environnement</label>
            <select id={`${channel}_mode`} name="mode" defaultValue={config.mode} className={field}><option value="sandbox">Test</option><option value="live">Production</option></select>
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor={`${channel}_sender`}>{channel === 'email' ? 'Adresse expéditeur' : channel === 'sms' ? 'Nom / numéro expéditeur' : 'Numéro WhatsApp'} <span className="font-normal text-gray-400">(facultatif — défaut plateforme)</span></label>
            <input id={`${channel}_sender`} name="sender_id" type="text" defaultValue={config.senderId ?? ''} maxLength={200} placeholder={channel === 'email' ? 'École <contact@mon-ecole.sn>' : ''} className={field} />
          </div>
          <div>
            <label className={label} htmlFor={`${channel}_key`}>Clé API propre {config.hasApiKey && <span className="font-normal text-emerald-600">· configurée</span>} <span className="font-normal text-gray-400">(facultatif)</span></label>
            <input id={`${channel}_key`} name="api_key" type="password" autoComplete="off" placeholder={config.hasApiKey ? '•••••••• (conserver)' : 'Défaut plateforme'} maxLength={500} className={field} />
          </div>
          <div>
            <label className={label} htmlFor={`${channel}_secret`}>Secret webhook {config.hasSecret && <span className="font-normal text-emerald-600">· configuré</span>} <span className="font-normal text-gray-400">(facultatif)</span></label>
            <input id={`${channel}_secret`} name="webhook_secret" type="password" autoComplete="off" placeholder={config.hasSecret ? '•••••••• (conserver)' : ''} maxLength={500} className={field} />
          </div>
        </div>
        <div className="rounded-lg border border-sand-200 bg-sand-50 px-3 py-2"><p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">URL de webhook (accusés de réception)</p><p className="mt-1 break-all font-mono text-xs text-gray-700">{webhookUrl}</p></div>
        <SaveButton />
      </form>

      {active && config.isEnabled && (
        <form action={sendTestMessage} className="flex flex-wrap items-end gap-2 border-t border-sand-100 pt-4">
          <input type="hidden" name="channel" value={channel} />
          <div className="flex-1 min-w-[180px]"><label className={label} htmlFor={`${channel}_test`}>Envoyer un test à</label><input id={`${channel}_test`} name="to" type="text" required placeholder={channel === 'email' ? 'vous@exemple.sn' : '+221…'} className={field} /></div>
          <button type="submit" className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-sand-50">Envoyer un test</button>
        </form>
      )}
    </div>
  )
}
