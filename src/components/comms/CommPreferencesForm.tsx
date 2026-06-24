'use client'

import { saveCommPreferences } from '@/lib/comms/pref-action'

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'finance', label: 'Finances (factures, paiements)' },
  { key: 'attendance', label: 'Présences (absences, retards)' },
  { key: 'academic', label: 'Scolarité (notes, bulletins)' },
  { key: 'announcements', label: 'Annonces de l’école' },
  { key: 'marketing', label: 'Actualités & nouveautés' },
]
const CHANNELS: { key: string; label: string }[] = [
  { key: 'email', label: 'E-mail' },
  { key: 'sms', label: 'SMS' },
  { key: 'whatsapp', label: 'WhatsApp' },
]

export function CommPreferencesForm({ redirectTo, initial }: { redirectTo: string; initial: Record<string, boolean> }) {
  return (
    <form action={saveCommPreferences} className="space-y-4 rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <p className="text-sm text-gray-600">Les notifications dans l’application sont toujours actives. Choisissez les canaux supplémentaires par type de message.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sand-200 text-left">
              <th className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Type</th>
              <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">In-app</th>
              {CHANNELS.map((c) => <th key={c.key} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat, idx) => (
              <tr key={cat.key} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                <td className="px-2 py-2.5 text-gray-800">{cat.label}</td>
                <td className="px-2 py-2.5 text-center text-emerald-600" title="Toujours actif">✓</td>
                {CHANNELS.map((ch) => (
                  <td key={ch.key} className="px-2 py-2.5 text-center">
                    <input type="checkbox" name={`${cat.key}_${ch.key}`} defaultChecked={!!initial[`${cat.key}_${ch.key}`]} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="submit" className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700">Enregistrer mes préférences</button>
    </form>
  )
}
