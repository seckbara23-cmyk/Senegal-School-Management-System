'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { enrollStudents, type EnrollStudentsState } from '../../actions'

// ─── Types ────────────────────────────────────────────────────────────────────

export type StudentOption = {
  id: string
  first_name: string
  last_name: string
  admission_number: string
  status: string
}

// ─── Submit button ─────────────────────────────────────────────────────────────

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus()
  const label =
    pending
      ? 'Inscription en cours…'
      : count === 0
      ? 'Sélectionner des élèves'
      : `Inscrire ${count} élève${count > 1 ? 's' : ''}`

  return (
    <button
      type="submit"
      disabled={pending || count === 0}
      className="inline-flex justify-center rounded-md bg-primary-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CLASS: Record<string, string> = {
  active:    'bg-primary-50 text-primary-700',
  inactive:  'bg-stone-100 text-stone-500',
  graduated: 'bg-sky-50 text-sky-700',
}
const STATUS_LABEL: Record<string, string> = {
  active:    'Actif',
  inactive:  'Inactif',
  graduated: 'Diplômé',
}

// ─── Form ─────────────────────────────────────────────────────────────────────

const initialState: EnrollStudentsState = {}

export function EnrollForm({
  students,
  classId,
  cancelHref,
}: {
  students: StudentOption[]
  classId: string
  cancelHref: string
}) {
  const [state, formAction] = useFormState(enrollStudents, initialState)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const allSelected = selected.size === students.length && students.length > 0

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(students.map((s) => s.id)))
  }

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="classId" value={classId} />

      {/* General error */}
      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((msg, i) => (
            <p key={i} className="text-sm text-red-700">
              {msg}
            </p>
          ))}
        </div>
      )}

      {/* Selection error */}
      {state.errors?.student_ids && (
        <div role="alert" className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3">
          {state.errors.student_ids.map((msg, i) => (
            <p key={i} className="text-sm text-amber-700">
              {msg}
            </p>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-sand-200">
            <thead>
              <tr className="bg-sand-50">
                <th scope="col" className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Tout sélectionner sur cette page"
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                  />
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Nom
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {`N° d'admission`}
                </th>
                <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {students.map((s) => {
                const isChecked = selected.has(s.id)
                return (
                  <tr
                    key={s.id}
                    className={`cursor-pointer transition-colors ${isChecked ? 'bg-primary-50' : 'hover:bg-sand-50'}`}
                    onClick={() => toggle(s.id)}
                  >
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        name="student_ids"
                        value={s.id}
                        checked={isChecked}
                        onChange={() => toggle(s.id)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                      />
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm font-medium text-gray-900">
                        {s.last_name} {s.first_name}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="font-mono text-sm text-gray-600">
                        {s.admission_number}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3.5 whitespace-nowrap sm:table-cell">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[s.status] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SubmitButton count={selected.size} />
        {selected.size > 0 && (
          <span className="text-sm text-gray-500">
            {selected.size} élève{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}
          </span>
        )}
        <a
          href={cancelHref}
          className="ml-auto text-sm text-gray-500 hover:text-gray-700 hover:underline"
        >
          Annuler
        </a>
      </div>
    </form>
  )
}
