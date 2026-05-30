'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useState } from 'react'
import { createSchoolWithAdmin, type CreateSchoolState } from '../actions'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inputClass(hasError: boolean): string {
  return (
    'mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ' +
    (hasError
      ? 'border-red-400 text-red-900 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 text-gray-900 focus:border-indigo-500 focus:ring-indigo-500')
  )
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) return null
  return <p className="mt-1 text-xs text-red-600">{errors[0]}</p>
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Création en cours…' : "Créer l'école et l'administrateur"}
    </button>
  )
}

// ─── Copy-to-clipboard row ──────────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-800">
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(value).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }}
          className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          {copied ? 'Copié ✓' : 'Copier'}
        </button>
      </div>
    </div>
  )
}

const initialState: CreateSchoolState = {}

// ─── Form ─────────────────────────────────────────────────────────────────────

export function NewSchoolForm() {
  const [state, formAction] = useFormState(createSchoolWithAdmin, initialState)
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)

  // ── Success screen ──────────────────────────────────────────────────────────
  if (state.success) {
    const s = state.success
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            </span>
            <div>
              <h2 className="text-lg font-semibold text-emerald-900">École créée avec succès</h2>
              <p className="text-sm text-emerald-700">{s.schoolName} est prête. Transmettez les accès ci-dessous à l&apos;administrateur.</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <CopyField label="École" value={s.schoolName} />
          <CopyField label="Email administrateur" value={s.adminEmail} />
          <CopyField label="Mot de passe temporaire" value={s.tempPassword} />
          <CopyField label="URL de connexion" value={s.loginUrl} />
          {s.resetLink && <CopyField label="Lien de réinitialisation (alternative)" value={s.resetLink} />}
          <p className="text-xs text-gray-400">
            Conseil : l&apos;administrateur devra changer ce mot de passe temporaire à la première connexion.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a href={`/super-admin/schools/${s.schoolId}`} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Voir l&apos;école
          </a>
          <a href="/super-admin/schools" className="text-sm text-gray-600 hover:text-gray-900 hover:underline">
            ← Toutes les écoles
          </a>
        </div>
      </div>
    )
  }

  // ── Creation form ─────────────────────────────────────────────────────────────
  return (
    <form action={formAction} noValidate className="space-y-8">
      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((m, i) => <p key={i} className="text-sm text-red-700">{m}</p>)}
        </div>
      )}

      {/* ── Section 1: School ─────────────────────────────────────────────────── */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-gray-500">1 · Établissement</legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nom de l&apos;école <span className="text-red-500">*</span></label>
            <input
              id="name" name="name" type="text" required placeholder="ex. Lycée Cheikh Anta Diop"
              className={inputClass(!!state.errors?.name)}
              onChange={(e) => { if (!slugEdited) setSlug(slugify(e.target.value)) }}
            />
            <FieldError errors={state.errors?.name} />
          </div>

          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-gray-700">Identifiant (slug) <span className="text-red-500">*</span></label>
            <input
              id="slug" name="slug" type="text" required placeholder="ex. lycee-cad"
              value={slug}
              onChange={(e) => { setSlugEdited(true); setSlug(slugify(e.target.value)) }}
              className={`${inputClass(!!state.errors?.slug)} font-mono`}
            />
            <FieldError errors={state.errors?.slug} />
          </div>
        </div>

        <div>
          <label htmlFor="address" className="block text-sm font-medium text-gray-700">Adresse</label>
          <input id="address" name="address" type="text" placeholder="ex. Avenue Cheikh Anta Diop, Dakar" className={inputClass(!!state.errors?.address)} />
          <FieldError errors={state.errors?.address} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Téléphone</label>
            <input id="phone" name="phone" type="tel" placeholder="+221 …" className={inputClass(!!state.errors?.phone)} />
            <FieldError errors={state.errors?.phone} />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email de l&apos;école</label>
            <input id="email" name="email" type="email" placeholder="contact@ecole.sn" className={inputClass(!!state.errors?.email)} />
            <FieldError errors={state.errors?.email} />
          </div>
          <div>
            <label htmlFor="subscription_status" className="block text-sm font-medium text-gray-700">Statut</label>
            <select id="subscription_status" name="subscription_status" defaultValue="active" className={inputClass(false)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspendue</option>
            </select>
          </div>
        </div>
      </fieldset>

      {/* ── Section 2: First admin ────────────────────────────────────────────── */}
      <fieldset className="space-y-4 border-t border-gray-100 pt-6">
        <legend className="text-sm font-semibold uppercase tracking-wide text-gray-500">2 · Premier administrateur</legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="admin_first_name" className="block text-sm font-medium text-gray-700">Prénom <span className="text-red-500">*</span></label>
            <input id="admin_first_name" name="admin_first_name" type="text" required className={inputClass(!!state.errors?.admin_first_name)} />
            <FieldError errors={state.errors?.admin_first_name} />
          </div>
          <div>
            <label htmlFor="admin_last_name" className="block text-sm font-medium text-gray-700">Nom <span className="text-red-500">*</span></label>
            <input id="admin_last_name" name="admin_last_name" type="text" required className={inputClass(!!state.errors?.admin_last_name)} />
            <FieldError errors={state.errors?.admin_last_name} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="admin_email" className="block text-sm font-medium text-gray-700">Email <span className="text-red-500">*</span></label>
            <input id="admin_email" name="admin_email" type="email" required autoComplete="off" placeholder="admin@ecole.sn" className={inputClass(!!state.errors?.admin_email)} />
            <FieldError errors={state.errors?.admin_email} />
          </div>
          <div>
            <label htmlFor="admin_password" className="block text-sm font-medium text-gray-700">Mot de passe temporaire <span className="text-red-500">*</span></label>
            <input id="admin_password" name="admin_password" type="text" required autoComplete="off" placeholder="8 caractères min." className={`${inputClass(!!state.errors?.admin_password)} font-mono`} />
            <FieldError errors={state.errors?.admin_password} />
            <p className="mt-1 text-xs text-gray-400">À communiquer à l&apos;administrateur ; il le changera à la première connexion.</p>
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
        <SubmitButton />
        <a href="/super-admin/schools" className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</a>
      </div>
    </form>
  )
}
