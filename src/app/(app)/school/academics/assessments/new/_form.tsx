'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createAssessment, type CreateAssessmentState } from '../../actions'

type ClassSubjectOption = {
  id: string
  className: string
  subjectName: string
  subjectCode: string | null
}
type PeriodOption = {
  id: string
  name: string
  yearName: string
}

const ASSESSMENT_TYPES = [
  { value: 'devoir',        label: 'Devoir' },
  { value: 'composition',   label: 'Composition' },
  { value: 'examen',        label: 'Examen' },
  { value: 'participation', label: 'Participation' },
  { value: 'autre',         label: 'Autre' },
]

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm"
    >
      {pending ? 'Enregistrement…' : 'Créer et saisir les notes'}
    </button>
  )
}

const initialState: CreateAssessmentState = {}

export function NewAssessmentForm({
  classSubjects,
  periods,
}: {
  classSubjects: ClassSubjectOption[]
  periods: PeriodOption[]
}) {
  const [state, formAction] = useFormState(createAssessment, initialState)

  return (
    <form action={formAction} className="space-y-5">

      {state.errors?._form && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.errors._form.join(' ')}
        </div>
      )}

      {/* Class subject */}
      <div>
        <label htmlFor="class_subject_id" className="block text-sm font-medium text-gray-700 mb-1">
          Classe · Matière <span className="text-red-500">*</span>
        </label>
        {classSubjects.length === 0 ? (
          <p className="text-sm text-amber-600">
            Aucune matière assignée à une classe.{' '}
            <a href="/school/academics/assignments" className="underline">Gérer les attributions →</a>
          </p>
        ) : (
          <select
            id="class_subject_id"
            name="class_subject_id"
            required
            className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            {classSubjects.map((cs) => (
              <option key={cs.id} value={cs.id}>
                {cs.className} — {cs.subjectName}{cs.subjectCode ? ` (${cs.subjectCode})` : ''}
              </option>
            ))}
          </select>
        )}
        {state.errors?.class_subject_id && (
          <p className="mt-1 text-xs text-red-600">{state.errors.class_subject_id.join(' ')}</p>
        )}
      </div>

      {/* Period */}
      <div>
        <label htmlFor="academic_period_id" className="block text-sm font-medium text-gray-700 mb-1">
          Période <span className="text-red-500">*</span>
        </label>
        {periods.length === 0 ? (
          <p className="text-sm text-amber-600">
            Aucune période configurée.{' '}
            <a href="/school/academics/periods/new" className="underline">Créer une période →</a>
          </p>
        ) : (
          <select
            id="academic_period_id"
            name="academic_period_id"
            required
            className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {p.yearName}</option>
            ))}
          </select>
        )}
        {state.errors?.academic_period_id && (
          <p className="mt-1 text-xs text-red-600">{state.errors.academic_period_id.join(' ')}</p>
        )}
      </div>

      {/* Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
          Titre <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          placeholder="ex. Devoir n°1"
          className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder-gray-400 focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        {state.errors?.title && (
          <p className="mt-1 text-xs text-red-600">{state.errors.title.join(' ')}</p>
        )}
      </div>

      {/* Type + Date */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="assessment_type" className="block text-sm font-medium text-gray-700 mb-1">
            Type
          </label>
          <select
            id="assessment_type"
            name="assessment_type"
            defaultValue="devoir"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            {ASSESSMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="assessment_date" className="block text-sm font-medium text-gray-700 mb-1">
            Date <span className="text-gray-400 font-normal">(facultatif)</span>
          </label>
          <input
            id="assessment_date"
            name="assessment_date"
            type="date"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
      </div>

      {/* Max score + Coefficient */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="max_score" className="block text-sm font-medium text-gray-700 mb-1">
            Barème
          </label>
          <input
            id="max_score"
            name="max_score"
            type="number"
            min="1"
            max="1000"
            step="0.5"
            defaultValue="20"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
          {state.errors?.max_score && (
            <p className="mt-1 text-xs text-red-600">{state.errors.max_score.join(' ')}</p>
          )}
        </div>
        <div>
          <label htmlFor="coefficient" className="block text-sm font-medium text-gray-700 mb-1">
            Coefficient
          </label>
          <input
            id="coefficient"
            name="coefficient"
            type="number"
            min="0.5"
            max="100"
            step="0.5"
            defaultValue="1"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
          {state.errors?.coefficient && (
            <p className="mt-1 text-xs text-red-600">{state.errors.coefficient.join(' ')}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <SubmitButton />
        <a
          href="/school/academics/assessments"
          className="text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Annuler
        </a>
      </div>

    </form>
  )
}
