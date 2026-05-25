'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createAttendanceSession, type CreateAttendanceState } from '../actions'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EnrolledStudent = {
  id: string
  first_name: string
  last_name: string
  admission_number: string
}

// ─── Status pill config ───────────────────────────────────────────────────────
// Full static class strings so Tailwind's scanner picks them all up.

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

// ─── Submit button ─────────────────────────────────────────────────────────────

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-md bg-primary-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending
        ? 'Enregistrement…'
        : `Enregistrer la présence (${count} élève${count !== 1 ? 's' : ''})`}
    </button>
  )
}

// ─── Form ─────────────────────────────────────────────────────────────────────

const initialState: CreateAttendanceState = {}

export function AttendanceForm({
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
  const [state, formAction] = useFormState(createAttendanceSession, initialState)

  return (
    <form action={formAction} noValidate className="space-y-5">
      {/* Hidden session fields */}
      <input type="hidden" name="class_id"     value={classId} />
      <input type="hidden" name="session_date" value={sessionDate} />

      {/* General error */}
      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((msg, i) => (
            <p key={i} className="text-sm text-red-700">
              {msg}
            </p>
          ))}
        </div>
      )}

      {/* Student attendance table */}
      <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-sand-200">
            <thead>
              <tr className="bg-sand-50">
                <th scope="col" className="sticky left-0 z-10 bg-sand-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Élève
                </th>
                <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                  {`N° d'admission`}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {students.map((s) => (
                <tr key={s.id} className="hover:bg-sand-50 transition-colors">
                  <td className="sticky left-0 z-10 bg-white px-4 py-3.5 group-hover:bg-sand-50">
                    <span className="text-sm font-medium text-gray-900">
                      {s.last_name} {s.first_name}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3.5 whitespace-nowrap sm:table-cell">
                    <span className="font-mono text-sm text-gray-500">
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

      {/* Optional session notes */}
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
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        <SubmitButton count={students.length} />
        <a
          href={cancelHref}
          className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
        >
          Annuler
        </a>
      </div>
    </form>
  )
}
