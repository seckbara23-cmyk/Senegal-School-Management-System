'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { linkStudentsToParent, type LinkStudentsState } from '../../actions'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AvailableStudent = {
  id: string
  first_name: string
  last_name: string
  admission_number: string
}

// ─── Submit button ─────────────────────────────────────────────────────────────

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || count === 0}
      className="inline-flex justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
    >
      {pending
        ? 'Enregistrement…'
        : count === 0
          ? 'Sélectionner des élèves'
          : `Lier ${count} élève${count !== 1 ? 's' : ''}`}
    </button>
  )
}

// ─── Form ─────────────────────────────────────────────────────────────────────

const initialState: LinkStudentsState = {}

export function LinkStudentsForm({
  students,
  parentId,
  cancelHref,
}: {
  students: AvailableStudent[]
  parentId: string
  cancelHref: string
}) {
  const [state, formAction] = useFormState(linkStudentsToParent, initialState)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === students.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(students.map((s) => s.id)))
    }
  }

  const allSelected = students.length > 0 && selected.size === students.length

  return (
    <form action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="parent_id" value={parentId} />

      {/* General error */}
      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((msg, i) => (
            <p key={i} className="text-sm text-red-700">{msg}</p>
          ))}
        </div>
      )}

      {/* Link options */}
      <div className="rounded-xl border border-sand-200 bg-sand-50 px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-widest text-primary-600 mb-3">
          Options du lien
        </p>
        <div className="flex flex-wrap items-end gap-5">
          <div className="flex-1 min-w-[180px]">
            <label htmlFor="relationship" className="block text-sm font-medium text-gray-700 mb-1">
              Lien de parenté
            </label>
            <select
              id="relationship"
              name="relationship"
              defaultValue="guardian"
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
            >
              <option value="father">Père</option>
              <option value="mother">Mère</option>
              <option value="guardian">Tuteur / Tutrice</option>
              <option value="other">Autre</option>
            </select>
          </div>

          <div className="flex items-center gap-2 pb-0.5">
            <input
              id="is_primary_contact"
              name="is_primary_contact"
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
            />
            <label htmlFor="is_primary_contact" className="text-sm font-medium text-gray-700 select-none">
              Contact principal
            </label>
          </div>
        </div>
      </div>

      {/* Student list */}
      <div className="overflow-hidden rounded-xl border border-sand-200">
        {/* Toolbar */}
        <div className="flex items-center gap-3 border-b border-sand-200 bg-sand-100 px-4 py-2.5">
          <input
            type="checkbox"
            id="select-all"
            checked={allSelected}
            onChange={toggleAll}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
          />
          <label htmlFor="select-all" className="text-xs font-semibold uppercase tracking-wider text-gray-500 select-none cursor-pointer">
            {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
          </label>
          {selected.size > 0 && (
            <span className="ml-auto text-xs font-medium text-primary-700">
              {selected.size} sélectionné{selected.size !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <table className="min-w-full">
          <thead>
            <tr className="border-b border-sand-200 bg-sand-50">
              <th scope="col" className="w-10 px-4 py-3">
                <span className="sr-only">Sélectionner</span>
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Élève
              </th>
              <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                N° Adm.
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-100">
            {students.map((s) => {
              const checked = selected.has(s.id)
              return (
                <tr
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className={`cursor-pointer transition-colors ${
                    checked ? 'bg-primary-50' : 'odd:bg-white even:bg-sand-50 hover:bg-accent-50'
                  }`}
                >
                  <td className="px-4 py-3.5 text-center">
                    <input
                      type="checkbox"
                      name="student_ids"
                      value={s.id}
                      checked={checked}
                      onChange={() => toggle(s.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm font-medium text-gray-900">
                      {s.last_name} {s.first_name}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3.5 whitespace-nowrap sm:table-cell">
                    <span className="font-mono text-sm text-gray-400">
                      {s.admission_number}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 border-t border-sand-200 pt-4">
        <SubmitButton count={selected.size} />
        <a
          href={cancelHref}
          className="text-sm text-gray-500 hover:text-gray-800 hover:underline"
        >
          Annuler
        </a>
      </div>
    </form>
  )
}
