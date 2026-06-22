'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { updateAdmissionsSettings, type AdmissionsSettingsState } from '../actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">
      {pending ? 'Enregistrement…' : 'Enregistrer'}
    </button>
  )
}

const field = 'block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'
const label = 'block text-sm font-medium text-gray-700 mb-1'

export function AdmissionsSettingsForm({ enabled, slug, intro, origin }: {
  enabled: boolean; slug: string; intro: string; origin: string; defaultSlug: string
}) {
  const [state, formAction] = useFormState(updateAdmissionsSettings, {} as AdmissionsSettingsState)
  const [isEnabled, setIsEnabled] = useState(enabled)
  const [slugVal, setSlugVal] = useState(slug)

  const publicUrl = slugVal ? `${origin}/apply/${slugVal}` : ''

  return (
    <form action={formAction} className="space-y-5 rounded-xl border border-sand-200 bg-white p-6 shadow-sm">
      {state.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</div>}

      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" name="enabled" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600" />
        <span>
          <span className="block text-sm font-semibold text-gray-900">Activer les candidatures en ligne</span>
          <span className="block text-xs text-gray-500">Une page publique sera accessible aux familles, sans compte.</span>
        </span>
      </label>

      <div>
        <label className={label} htmlFor="slug">Identifiant public</label>
        <div className="flex items-center gap-1">
          <span className="text-sm text-gray-400">{origin}/apply/</span>
          <input id="slug" name="slug" type="text" value={slugVal} onChange={(e) => setSlugVal(e.target.value)} placeholder="mon-ecole" maxLength={60} className={field} />
        </div>
        <p className="mt-1 text-xs text-gray-400">Lettres, chiffres et tirets uniquement.</p>
      </div>

      <div>
        <label className={label} htmlFor="intro">Message d’accueil <span className="font-normal text-gray-400">(facultatif)</span></label>
        <textarea id="intro" name="intro" defaultValue={intro} rows={3} maxLength={2000} placeholder="Bienvenue ! Remplissez ce formulaire pour candidater…" className={field} />
      </div>

      {isEnabled && publicUrl && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Lien public</p>
          <a href={publicUrl} target="_blank" rel="noreferrer" className="mt-1 block break-all text-sm font-medium text-sky-800 hover:underline">{publicUrl}</a>
          <p className="mt-1 text-xs text-sky-600">Partagez ce lien sur votre site, vos réseaux ou par affichage. Enregistrez d’abord pour l’activer.</p>
        </div>
      )}

      <SubmitButton />
    </form>
  )
}
