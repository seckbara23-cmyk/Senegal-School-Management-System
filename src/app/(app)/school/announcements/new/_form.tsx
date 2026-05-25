'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createAnnouncement, type CreateAnnouncementState } from '../actions'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClassOption = {
  id: string
  name: string
  section: string | null
  academic_years: { name: string }
}

// ─── Audience config ──────────────────────────────────────────────────────────
// Static class strings for Tailwind scanning.

const AUDIENCE_OPTIONS = [
  {
    value:       'all_school',
    label:       "Tout l'établissement",
    description: 'Tous les membres enregistrés',
    chipClass:
      'border-primary-200 bg-primary-50 text-primary-700 ' +
      'peer-checked:border-primary-600 peer-checked:bg-primary-600 peer-checked:text-white',
  },
  {
    value:       'parents',
    label:       'Parents & tuteurs',
    description: 'Responsables légaux avec un compte',
    chipClass:
      'border-sky-200 bg-sky-50 text-sky-700 ' +
      'peer-checked:border-sky-600 peer-checked:bg-sky-600 peer-checked:text-white',
  },
  {
    value:       'students',
    label:       'Élèves',
    description: 'Élèves avec un compte',
    chipClass:
      'border-amber-200 bg-amber-50 text-amber-700 ' +
      'peer-checked:border-amber-500 peer-checked:bg-amber-500 peer-checked:text-white',
  },
  {
    value:       'staff',
    label:       'Personnel',
    description: 'Admins, enseignants, finance',
    chipClass:
      'border-sand-300 bg-sand-100 text-gray-700 ' +
      'peer-checked:border-gray-600 peer-checked:bg-gray-700 peer-checked:text-white',
  },
  {
    value:       'class',
    label:       'Une classe',
    description: "Élèves et parents d'une classe",
    chipClass:
      'border-primary-200 bg-primary-50 text-primary-700 ' +
      'peer-checked:border-primary-600 peer-checked:bg-primary-600 peer-checked:text-white',
  },
] as const

// ─── Submit button ─────────────────────────────────────────────────────────────

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
    >
      {pending ? 'Publication…' : 'Publier l’annonce'}
    </button>
  )
}

// ─── Form ─────────────────────────────────────────────────────────────────────

const initialState: CreateAnnouncementState = {}

export function AnnouncementForm({ classes }: { classes: ClassOption[] }) {
  const [state, formAction] = useFormState(createAnnouncement, initialState)
  const [audience, setAudience] = useState<string>('all_school')

  return (
    <form action={formAction} noValidate className="space-y-6">

      {/* General error */}
      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((msg, i) => (
            <p key={i} className="text-sm text-red-700">{msg}</p>
          ))}
        </div>
      )}

      {/* Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
          Titre <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          placeholder="Réunion de parents, Fermeture exceptionnelle…"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        {state.errors?.title && (
          <p className="mt-1 text-xs text-red-600">{state.errors.title[0]}</p>
        )}
      </div>

      {/* Body */}
      <div>
        <label htmlFor="body" className="block text-sm font-medium text-gray-700 mb-1">
          Contenu{' '}
          <span className="font-normal text-gray-400">(optionnel)</span>
        </label>
        <textarea
          id="body"
          name="body"
          rows={5}
          placeholder="Rédigez le texte de l'annonce…"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600 leading-relaxed"
        />
        {state.errors?.body && (
          <p className="mt-1 text-xs text-red-600">{state.errors.body[0]}</p>
        )}
      </div>

      {/* Audience */}
      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">
          Destinataires <span className="text-red-500">*</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {AUDIENCE_OPTIONS.map((opt) => (
            <label key={opt.value} className="cursor-pointer select-none">
              <input
                type="radio"
                name="audience_type"
                value={opt.value}
                defaultChecked={opt.value === 'all_school'}
                onChange={() => setAudience(opt.value)}
                className="sr-only peer"
              />
              <span
                className={`inline-flex flex-col rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${opt.chipClass}`}
              >
                {opt.label}
                <span className="font-normal opacity-75 mt-0.5 text-[10px]">
                  {opt.description}
                </span>
              </span>
            </label>
          ))}
        </div>
        {state.errors?.audience_type && (
          <p className="mt-1 text-xs text-red-600">{state.errors.audience_type[0]}</p>
        )}
      </div>

      {/* Class selector — only when audience = 'class' */}
      {audience === 'class' && (
        <div>
          <label htmlFor="class_id" className="block text-sm font-medium text-gray-700 mb-1">
            Classe <span className="text-red-500">*</span>
          </label>
          {classes.length === 0 ? (
            <p className="text-sm text-amber-700">
              Aucune classe disponible.{' '}
              <a href="/school/classes/new" className="underline hover:text-amber-900">
                Créer une classe
              </a>
            </p>
          ) : (
            <select
              id="class_id"
              name="class_id"
              defaultValue=""
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
            >
              <option value="">— Sélectionner une classe —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.name, c.section].filter(Boolean).join(' — ')} ({c.academic_years.name})
                </option>
              ))}
            </select>
          )}
          {state.errors?.class_id && (
            <p className="mt-1 text-xs text-red-600">{state.errors.class_id[0]}</p>
          )}
        </div>
      )}

      {/* Info note about delivery */}
      <div className="rounded-lg border border-sand-200 bg-sand-50 px-4 py-3 text-xs text-gray-500 leading-relaxed">
        <strong className="text-gray-700">À propos des notifications :</strong>{' '}
        Une notification sera envoyée aux destinataires qui ont déjà un compte dans la plateforme.
        Les autres recevront l&apos;annonce lors de leur prochaine connexion.
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 border-t border-sand-200 pt-4">
        <SubmitButton />
        <a
          href="/school/announcements"
          className="text-sm text-gray-500 hover:text-gray-800 hover:underline"
        >
          Annuler
        </a>
      </div>
    </form>
  )
}
