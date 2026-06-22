'use client'

import { useState } from 'react'

const field = 'block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'

type Result = {
  found: boolean
  reference?: string
  firstName?: string
  statusLabel?: string
  events?: { label: string; message: string | null; statusLabel: string | null; created_at: string }[]
}

function fmt(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) }

export function TrackForm() {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null); setResult(null); setPending(true)
    const fd = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/admissions/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference: fd.get('reference'), token: fd.get('token') }) })
      const data = await res.json()
      if (!data.found) { setError('Candidature introuvable. Vérifiez votre référence et votre code de suivi.'); setPending(false); return }
      setResult(data); setPending(false)
    } catch {
      setError('Connexion impossible. Réessayez.'); setPending(false)
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <div>
          <label htmlFor="reference" className="mb-1 block text-sm font-medium text-gray-700">Référence</label>
          <input id="reference" name="reference" required placeholder="APP-2026-000123" className={field} />
        </div>
        <div>
          <label htmlFor="token" className="mb-1 block text-sm font-medium text-gray-700">Code de suivi</label>
          <input id="token" name="token" required className={field} />
        </div>
        <button type="submit" disabled={pending} className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">
          {pending ? 'Recherche…' : 'Suivre'}
        </button>
      </form>

      {result?.found && (
        <div className="space-y-4 rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-gray-500">Candidature de {result.firstName}</p>
              <p className="font-mono text-xs text-gray-400">{result.reference}</p>
            </div>
            <span className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-sm font-semibold text-primary-700">{result.statusLabel}</span>
          </div>
          {result.events && result.events.length > 0 && (
            <ol className="space-y-3 border-t border-sand-100 pt-4">
              {result.events.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{e.label}{e.statusLabel ? ` · ${e.statusLabel}` : ''}</p>
                    {e.message && <p className="text-sm text-gray-600">{e.message}</p>}
                    <p className="text-[11px] text-gray-400">{fmt(e.created_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
