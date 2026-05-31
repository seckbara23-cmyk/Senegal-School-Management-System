'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import {
  addSchoolAdmin,
  setSchoolAdminStatus,
  removeSchoolAdmin,
  generateSchoolAdminResetLink,
  type AddAdminState,
  type AdminResetLinkState,
} from '../actions'
import { ConfirmButton } from './_confirm'

export type AdminView = {
  userId:      string
  fullName:    string | null
  email:       string | null
  status:      string
  lastLogin:   string
}

// ─── Copy-to-clipboard row ───────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-800">{value}</code>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
          className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          {copied ? 'Copié ✓' : 'Copier'}
        </button>
      </div>
    </div>
  )
}

// ─── Per-admin password reset link ───────────────────────────────────────────

const resetInitial: AdminResetLinkState = {}

function ResetLinkButton({ schoolId, userId }: { schoolId: string; userId: string }) {
  const [state, formAction] = useFormState(generateSchoolAdminResetLink, resetInitial)
  const { pending } = useFormStatus()

  if (state.link) {
    return <div className="mt-2 w-full"><CopyField label="Lien de réinitialisation" value={state.link} /></div>
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="school_id" value={schoolId} />
      <input type="hidden" name="user_id" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? '…' : 'Lien de réinitialisation'}
      </button>
      {state.errors?._form && <p className="mt-1 text-xs text-red-600">{state.errors._form[0]}</p>}
    </form>
  )
}

// ─── Add admin form (create new / attach existing) ───────────────────────────

const addInitial: AddAdminState = {}

function AddAdminSubmit({ mode }: { mode: 'create' | 'attach' }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
    >
      {pending ? 'En cours…' : mode === 'create' ? 'Créer et ajouter' : 'Lier le compte'}
    </button>
  )
}

function AddAdminForm({ schoolId }: { schoolId: string }) {
  const [state, formAction] = useFormState(addSchoolAdmin, addInitial)
  const [mode, setMode] = useState<'create' | 'attach'>('create')
  const [open, setOpen] = useState(false)

  if (state.success?.mode === 'create') {
    const s = state.success
    return (
      <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-900">Administrateur créé : {s.email}</p>
        <div className="space-y-3 rounded-lg bg-white p-3">
          <CopyField label="Email" value={s.email} />
          {s.tempPassword && <CopyField label="Mot de passe temporaire" value={s.tempPassword} />}
          {s.resetLink && <CopyField label="Lien de réinitialisation (alternative)" value={s.resetLink} />}
        </div>
        <a href={`/super-admin/schools/${schoolId}`} className="inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Actualiser la liste
        </a>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
        Ajouter un administrateur
      </button>
    )
  }

  return (
    <form action={formAction} noValidate className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <input type="hidden" name="school_id" value={schoolId} />
      <input type="hidden" name="mode" value={mode} />

      {state.errors?._form && <p className="text-sm text-red-700">{state.errors._form[0]}</p>}

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('create')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${mode === 'create' ? 'bg-indigo-600 text-white' : 'border border-gray-300 text-gray-600 hover:bg-white'}`}
        >
          Créer un compte
        </button>
        <button
          type="button"
          onClick={() => setMode('attach')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${mode === 'attach' ? 'bg-indigo-600 text-white' : 'border border-gray-300 text-gray-600 hover:bg-white'}`}
        >
          Lier un compte existant
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={mode === 'create' ? 'sm:col-span-1' : 'sm:col-span-2'}>
          <label htmlFor="admin_email" className="block text-xs font-medium text-gray-600">Email</label>
          <input id="admin_email" name="email" type="email" required autoComplete="off" placeholder="admin@ecole.sn"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          {state.errors?.email && <p className="mt-1 text-xs text-red-600">{state.errors.email[0]}</p>}
        </div>

        {mode === 'create' && (
          <>
            <div>
              <label htmlFor="admin_full_name" className="block text-xs font-medium text-gray-600">Nom complet</label>
              <input id="admin_full_name" name="full_name" type="text" placeholder="Prénom Nom"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              {state.errors?.full_name && <p className="mt-1 text-xs text-red-600">{state.errors.full_name[0]}</p>}
            </div>
            <div>
              <label htmlFor="admin_password" className="block text-xs font-medium text-gray-600">Mot de passe temporaire</label>
              <input id="admin_password" name="password" type="text" autoComplete="off" placeholder="8 caractères min."
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              {state.errors?.password && <p className="mt-1 text-xs text-red-600">{state.errors.password[0]}</p>}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <AddAdminSubmit mode={mode} />
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</button>
      </div>
    </form>
  )
}

// ─── Section ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  active:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  inactive: 'bg-gray-100 text-gray-600 border-gray-200',
}

export function SchoolAdmins({ schoolId, admins }: { schoolId: string; admins: AdminView[] }) {
  const activeCount = admins.filter((a) => a.status === 'active').length

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Administrateurs</h2>
      </div>

      {admins.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-gray-400">Aucun administrateur lié à cette école.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {admins.map((a) => {
            const isLastActive = a.status === 'active' && activeCount <= 1
            return (
              <li key={a.userId} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{a.fullName || '—'}</p>
                    <p className="truncate text-xs text-gray-500">{a.email || a.userId}</p>
                    <p className="mt-0.5 text-xs text-gray-400">Dernière connexion : {a.lastLogin}</p>
                  </div>
                  <span className={`inline-block shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[a.status] ?? STATUS_BADGE.inactive}`}>
                    {a.status === 'active' ? 'Actif' : 'Inactif'}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {a.status === 'active' ? (
                    <ConfirmButton
                      action={setSchoolAdminStatus}
                      hiddens={{ school_id: schoolId, user_id: a.userId, new_status: 'inactive' }}
                      trigger="Désactiver"
                      message="Désactiver cet administrateur ?"
                      confirmLabel="Désactiver"
                      tone="danger"
                      disabled={isLastActive}
                      disabledReason="Impossible de désactiver le dernier administrateur actif."
                    />
                  ) : (
                    <ConfirmButton
                      action={setSchoolAdminStatus}
                      hiddens={{ school_id: schoolId, user_id: a.userId, new_status: 'active' }}
                      trigger="Réactiver"
                      message="Réactiver cet administrateur ?"
                      confirmLabel="Réactiver"
                      tone="primary"
                    />
                  )}

                  <ConfirmButton
                    action={removeSchoolAdmin}
                    hiddens={{ school_id: schoolId, user_id: a.userId }}
                    trigger="Retirer"
                    message="Retirer le rôle d'administrateur ? Le compte est conservé."
                    confirmLabel="Retirer"
                    tone="danger"
                    disabled={isLastActive}
                    disabledReason="Impossible de retirer le dernier administrateur actif."
                  />

                  <ResetLinkButton schoolId={schoolId} userId={a.userId} />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="border-t border-gray-100 px-5 py-4">
        <AddAdminForm schoolId={schoolId} />
      </div>
    </div>
  )
}
