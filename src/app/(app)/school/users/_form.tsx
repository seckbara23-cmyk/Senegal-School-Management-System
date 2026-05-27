'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createSchoolUser, type CreateSchoolUserState } from './actions'

export type EntityOption = {
  id:   string
  name: string
}

const ROLE_LABELS: Record<string, string> = {
  school_admin:    'Administrateur',
  teacher:         'Enseignant',
  finance_officer: 'Agent financier',
  parent:          'Parent',
  student:         'Élève',
}

const ROLE_COLORS: Record<string, string> = {
  school_admin:    'bg-primary-100 text-primary-700',
  teacher:         'bg-emerald-100 text-emerald-700',
  finance_officer: 'bg-amber-100 text-amber-700',
  parent:          'bg-sky-100 text-sky-700',
  student:         'bg-gray-100 text-gray-600',
}

const ENTITY_LABELS: Record<string, string> = {
  teacher: 'Dossier enseignant',
  parent:  'Dossier parent',
  student: 'Dossier élève',
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
    >
      {pending ? 'Création en cours…' : 'Créer le compte'}
    </button>
  )
}

const initialState: CreateSchoolUserState = {}

const INPUT_CLS =
  'block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder-gray-400 focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'

export function CreateUserForm({
  role,
  entityOptions,
}: {
  role:          string
  entityOptions: EntityOption[]
}) {
  const [state, formAction] = useFormState(createSchoolUser, initialState)
  const [showPwd, setShowPwd] = useState(false)

  const hasEntityPicker = ['teacher', 'parent', 'student'].includes(role)

  return (
    <form action={formAction} className="space-y-5" autoComplete="off">
      {/* Hidden role field */}
      <input type="hidden" name="role" value={role} />

      {/* _form errors */}
      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.errors._form.join(' ')}
        </div>
      )}

      {/* Role display */}
      <div>
        <p className="block text-sm font-medium text-gray-700 mb-1.5">Rôle</p>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-600'}`}>
          {ROLE_LABELS[role] ?? role}
        </span>
      </div>

      {/* Full name */}
      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
          Nom complet <span className="text-red-500">*</span>
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          autoComplete="off"
          placeholder="Ex. Aminata Diallo"
          className={INPUT_CLS}
        />
        {state.errors?.full_name && (
          <p className="mt-1 text-xs text-red-600">{state.errors.full_name[0]}</p>
        )}
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Adresse email <span className="text-red-500">*</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="prenom.nom@exemple.com"
          className={INPUT_CLS}
        />
        {state.errors?.email && (
          <p className="mt-1 text-xs text-red-600">{state.errors.email[0]}</p>
        )}
      </div>

      {/* Temporary password */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Mot de passe temporaire <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPwd ? 'text' : 'password'}
            required
            autoComplete="new-password"
            minLength={8}
            placeholder="Minimum 8 caractères"
            className={INPUT_CLS + ' pr-20'}
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            {showPwd ? 'Masquer' : 'Afficher'}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-gray-500">
          Communiquez ce mot de passe à l&apos;utilisateur lors de la remise des identifiants. Il pourra le modifier depuis son profil.
        </p>
        {state.errors?.password && (
          <p className="mt-1 text-xs text-red-600">{state.errors.password[0]}</p>
        )}
      </div>

      {/* Entity picker */}
      {hasEntityPicker && (
        <div>
          <label htmlFor="entity_id" className="block text-sm font-medium text-gray-700 mb-1">
            {ENTITY_LABELS[role] ?? 'Dossier lié'}{' '}
            <span className="font-normal text-gray-400">(optionnel)</span>
          </label>

          {entityOptions.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-800">
                Aucun dossier disponible à lier. Vous pourrez lier le compte depuis la fiche utilisateur après la création.
              </p>
            </div>
          ) : (
            <>
              <select id="entity_id" name="entity_id" className={INPUT_CLS}>
                <option value="">— Lier plus tard —</option>
                {entityOptions.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-gray-500">
                Lier ce compte à un dossier existant active l&apos;accès au portail correspondant.
              </p>
            </>
          )}

          {state.errors?.entity_id && (
            <p className="mt-1 text-xs text-red-600">{state.errors.entity_id[0]}</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 border-t border-sand-200 pt-4">
        <SubmitButton />
        <a
          href="/school/users/new"
          className="text-sm text-gray-500 hover:text-gray-800 hover:underline"
        >
          ← Changer de rôle
        </a>
        <a
          href="/school/users"
          className="ml-auto text-sm text-gray-400 hover:text-gray-600"
        >
          Annuler
        </a>
      </div>
    </form>
  )
}
