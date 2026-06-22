'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function SubmitButton() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit() {
    setError(null); setPending(true)
    try {
      const res = await fetch('/api/admissions/submit', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Échec de la soumission.'); setPending(false); return }
      router.push(data.redirect as string)
    } catch {
      setError('Connexion impossible. Réessayez.'); setPending(false)
    }
  }

  return (
    <div className="text-right">
      {error && <p role="alert" className="mb-2 text-sm text-red-700">{error}</p>}
      <button type="button" onClick={submit} disabled={pending} className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
        {pending ? 'Envoi…' : 'Soumettre la candidature'}
      </button>
    </div>
  )
}
