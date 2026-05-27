'use client'

import { useRef } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createTeacherAttendanceSession, type CreateTeacherAttendanceState } from './actions'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EnrolledStudent = {
  id: string
  first_name: string
  last_name: string
  admission_number: string
}

// ─── Status pill config ───────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  {
    value: 'present',
    label: 'Présent',
    pillClass:
      'border-primary-200 bg-primary-50 text-primary-700 ' +
      'peer-checked:border-primary-600 peer-checked:bg-primary-600 peer-checked:text-white',
  },
  {
    value: 'absent',
    label: 'Absent',
    pillClass:
      'border-red-200 bg-red-50 text-red-700 ' +
      'peer-checked:border-red-600 peer-checked:bg-red-600 peer-checked:text-white',
  },
  {
    value: 'late',
    label: 'En retard',
    pillClass:
      'border-amber-200 bg-amber-50 text-amber-700 ' +
      'peer-checked:border-amber-500 peer-checked:bg-amber-500 peer-checked:text-white',
  },
  {
    value: 'excused',
    label: 'Excusé',
    pillClass:
      'border-sky-200 bg-sky-50 text-sky-700 ' +
      'peer-checked:border-sky-600 peer-checked:bg-sky-600 peer-checked:text-white',
  },
] as const

// ─── Submit button ────────────────────────────────────────────────────────────

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
    >
      {pending
        ? 'Enregistrement…'
        : `Enregistrer la séance (${count} élève${count !== 1 ? 's' : ''})`}
    </button>
  )
}

// ─── Form ─────────────────────────────────────────────────────────────────────

const initialState: CreateTeacherAttendanceState = {}

export function TeacherAttendanceForm({
  students,
  classId,
  sessionDate,
  cancelHref,
}: {
  students: EnrolledStudent[]
  classId: string
  sessionDate: string
  cancelHref: string
}) {
  const [state, formAction] = useFormState(createTeacherAttendanceSession, initialState)
  const formRef = useRef<HTMLFormElement>(null)

  function handleMarkAllPresent() {
    if (!formRef.current) return
    formRef.current
      .querySelectorAll<HTMLInputElement>('input[type="radio"][value="present"]')
      .forEach((r) => { r.checked = true })
  }

  function handleMarkAllAbsent() {
    if (!formRef.current) return
    formRef.current
      .querySelectorAll<HTMLInputElement>('input[type="radio"][value="absent"]')
      .forEach((r) => { r.checked = true })
  }

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-5">
      {/* Hidden fields */}
      <input type="hidden" name="class_id"     value={classId} />
      <input type="hidden" name="session_date" value={sessionDate} />

      {/* General error */}
      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((msg, i) => (
            <p key={i} className="text-sm text-red-700">{msg}</p>
          ))}
        </div>
      )}

      {/* Quick-mark toolbar */}
      <div className="flex items-center gap-3 rounded-lg border border-sand-200 bg-sand-50 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 mr-1">
          Marquer tout :
        </span>
        <button
          type="button"
          onClick={handleMarkAllPresent}
          className="rounded-md border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-100 transition-colors"
        >
          ● Présent
        </button>
        <button
          type="button"
          onClick={handleMarkAllAbsent}
          className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
        >
          ● Absent
        </button>
      </div>

      {/* Student register table */}
      <div className="overflow-hidden rounded-xl border border-sand-200">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-sand-200 bg-sand-100">
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Élève
                </th>
                <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                  {`N° Adm.`}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {students.map((s) => (
                <tr key={s.id} className="odd:bg-white even:bg-sand-50">
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
                  <td className="px-4 py-3.5">
                    <div
                      className="flex flex-wrap gap-1.5"
                      role="radiogroup"
                      aria-label={`Présence de ${s.last_name} ${s.first_name}`}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <label key={opt.value} className="cursor-pointer select-none">
                          <input
                            type="radio"
                            name={`status_${s.id}`}
                            value={opt.value}
                            defaultChecked={opt.value === 'present'}
                            className="sr-only peer"
                          />
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${opt.pillClass}`}
                          >
                            {opt.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
          Notes de séance{' '}
          <span className="font-normal text-gray-400">(optionnel)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          placeholder="Observations générales sur la séance…"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        {state.errors?.notes && (
          <p className="mt-1 text-xs text-red-600">{state.errors.notes[0]}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 border-t border-sand-200 pt-4">
        <SubmitButton count={students.length} />
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
