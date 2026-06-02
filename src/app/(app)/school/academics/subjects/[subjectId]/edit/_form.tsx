'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { updateSubject, type UpdateSubjectState } from '../../../actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm"
    >
      {pending ? 'Enregistrement…' : 'Enregistrer les modifications'}
    </button>
  )
}

type SubjectData = {
  id: string
  name: string
  code: string | null
  coefficient: number | null
}

const initialState: UpdateSubjectState = {}

export function EditSubjectForm({ subject }: { subject: SubjectData }) {
  const [state, formAction] = useFormState(updateSubject, initialState)

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="subject_id" value={subject.id} />

      {state.errors?._form && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.errors._form.join(' ')}
        </div>
      )}

      {/* Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Nom de la matière <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={subject.name}
          placeholder="ex. Mathématiques"
          className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder-gray-400 focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        {state.errors?.name && (
          <p className="mt-1 text-xs text-red-600">{state.errors.name.join(' ')}</p>
        )}
      </div>

      {/* Code */}
      <div>
        <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
          Code <span className="text-gray-400 font-normal">(facultatif)</span>
        </label>
        <input
          id="code"
          name="code"
          type="text"
          defaultValue={subject.code ?? ''}
          placeholder="ex. MATH"
          maxLength={20}
          className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder-gray-400 focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        {state.errors?.code && (
          <p className="mt-1 text-xs text-red-600">{state.errors.code.join(' ')}</p>
        )}
      </div>

      {/* Coefficient */}
      <div>
        <label htmlFor="coefficient" className="block text-sm font-medium text-gray-700 mb-1">
          Coefficient <span className="text-gray-400 font-normal">(facultatif)</span>
        </label>
        <input
          id="coefficient"
          name="coefficient"
          type="number"
          min="0"
          max="100"
          step="0.5"
          defaultValue={subject.coefficient ?? ''}
          placeholder="ex. 3"
          className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder-gray-400 focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        {state.errors?.coefficient && (
          <p className="mt-1 text-xs text-red-600">{state.errors.coefficient.join(' ')}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <SubmitButton />
        <a
          href="/school/academics/subjects"
          className="text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Annuler
        </a>
      </div>

    </form>
  )
}
