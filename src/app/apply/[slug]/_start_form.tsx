'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const field = 'block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'
const label = 'block text-sm font-medium text-gray-700 mb-1'

export function StartForm({ slug, classes }: { slug: string; classes: { id: string; label: string }[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null); setPending(true)
    const fd = new FormData(e.currentTarget)
    const payload: Record<string, string> = { slug }
    fd.forEach((v, k) => { if (typeof v === 'string') payload[k] = v })
    try {
      const res = await fetch('/api/admissions/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Une erreur est survenue.'); setPending(false); return }
      router.push(`/apply/${slug}/documents`)
    } catch {
      setError('Connexion impossible. Réessayez.'); setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Honeypot — hidden from humans */}
      <input type="text" name="hp" tabIndex={-1} autoComplete="off" className="absolute left-[-9999px] h-0 w-0" aria-hidden="true" />

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-900">Élève</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label className={label} htmlFor="first_name">Prénom *</label><input id="first_name" name="first_name" required maxLength={100} className={field} /></div>
          <div><label className={label} htmlFor="last_name">Nom *</label><input id="last_name" name="last_name" required maxLength={100} className={field} /></div>
          <div>
            <label className={label} htmlFor="gender">Sexe</label>
            <select id="gender" name="gender" defaultValue="" className={field}><option value="">—</option><option value="male">Masculin</option><option value="female">Féminin</option><option value="other">Autre</option></select>
          </div>
          <div><label className={label} htmlFor="date_of_birth">Date de naissance</label><input id="date_of_birth" name="date_of_birth" type="date" className={field} /></div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="desired_class_id">Classe souhaitée</label>
            <select id="desired_class_id" name="desired_class_id" defaultValue="" className={field}>
              <option value="">— Indécis —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div><label className={label} htmlFor="desired_level">Niveau souhaité <span className="font-normal text-gray-400">(si non listé)</span></label><input id="desired_level" name="desired_level" maxLength={100} placeholder="Ex. 6e, CP…" className={field} /></div>
        </div>
        <div><label className={label} htmlFor="previous_school">École précédente</label><input id="previous_school" name="previous_school" maxLength={200} className={field} /></div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-900">Parent / tuteur</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label className={label} htmlFor="guardian_name">Nom complet</label><input id="guardian_name" name="guardian_name" maxLength={200} className={field} /></div>
          <div>
            <label className={label} htmlFor="guardian_relationship">Lien de parenté</label>
            <select id="guardian_relationship" name="guardian_relationship" defaultValue="" className={field}><option value="">—</option><option value="father">Père</option><option value="mother">Mère</option><option value="guardian">Tuteur</option><option value="other">Autre</option></select>
          </div>
          <div><label className={label} htmlFor="guardian_phone">Téléphone</label><input id="guardian_phone" name="guardian_phone" maxLength={50} className={field} /></div>
          <div><label className={label} htmlFor="guardian_email">Email</label><input id="guardian_email" name="guardian_email" type="email" maxLength={200} className={field} /></div>
        </div>
        <div><label className={label} htmlFor="guardian_address">Adresse</label><input id="guardian_address" name="guardian_address" maxLength={300} className={field} /></div>
      </fieldset>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">* champs obligatoires</p>
        <button type="submit" disabled={pending} className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">
          {pending ? 'Patientez…' : 'Continuer →'}
        </button>
      </div>
    </form>
  )
}
