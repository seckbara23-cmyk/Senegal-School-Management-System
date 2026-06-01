'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useState } from 'react'
import type { TimetableSlotState } from './actions'

export type ClassOption   = { id: string; label: string; academic_year_id: string }
export type ClassSubjectOption = { id: string; class_id: string; label: string; teacher_id: string | null }
export type TeacherOption = { id: string; label: string }
export type AcademicYearOption = { id: string; label: string }

export type SlotInitial = {
  academic_year_id: string
  class_id:         string
  class_subject_id: string
  teacher_id:       string | null
  day_of_week:      number
  start_time:       string
  end_time:         string
  room:             string | null
  notes:            string | null
}

const DAYS = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 7, label: 'Dimanche' },
]

function inputClass(hasError: boolean): string {
  return 'mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ' +
    (hasError ? 'border-red-400 text-red-900 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 text-gray-900 focus:border-primary-600 focus:ring-primary-600')
}
function FieldError({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) return null
  return <p className="mt-1 text-xs text-red-600">{errors[0]}</p>
}

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
    >
      {pending ? 'Enregistrement…' : editing ? 'Enregistrer les modifications' : 'Créer le créneau'}
    </button>
  )
}

type Props = {
  action:        (state: TimetableSlotState, formData: FormData) => Promise<TimetableSlotState>
  academicYears: AcademicYearOption[]
  classes:       ClassOption[]
  classSubjects: ClassSubjectOption[]
  teachers:      TeacherOption[]
  initial?:      SlotInitial
  slotId?:       string
  cancelHref:    string
}

export function TimetableSlotForm({ action, academicYears, classes, classSubjects, teachers, initial, slotId, cancelHref }: Props) {
  const [state, formAction] = useFormState(action, {})

  const [yearId, setYearId]   = useState(initial?.academic_year_id ?? (academicYears[0]?.id ?? ''))
  const [classId, setClassId] = useState(initial?.class_id ?? '')
  const [csId, setCsId]       = useState(initial?.class_subject_id ?? '')
  const [teacherId, setTeacherId] = useState(initial?.teacher_id ?? '')

  const visibleClasses = classes.filter((c) => !yearId || c.academic_year_id === yearId)
  const visibleCS      = classSubjects.filter((cs) => cs.class_id === classId)

  // When a class subject is chosen, default the teacher to its assigned one.
  function onSelectCS(value: string) {
    setCsId(value)
    const cs = classSubjects.find((c) => c.id === value)
    if (cs && cs.teacher_id) setTeacherId(cs.teacher_id)
  }

  return (
    <form action={formAction} noValidate className="space-y-5">
      {slotId && <input type="hidden" name="slot_id" value={slotId} />}

      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((m, i) => <p key={i} className="text-sm text-red-700">{m}</p>)}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Academic year (drives class list; not submitted — class determines year) */}
        <div>
          <label htmlFor="academic_year" className="block text-sm font-medium text-gray-700">Année scolaire</label>
          <select
            id="academic_year" value={yearId}
            onChange={(e) => { setYearId(e.target.value); setClassId(''); setCsId('') }}
            className={inputClass(false)}
          >
            {academicYears.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
          </select>
        </div>

        {/* Class */}
        <div>
          <label htmlFor="class_id" className="block text-sm font-medium text-gray-700">Classe <span className="text-red-500">*</span></label>
          <select
            id="class_id" name="class_id" required value={classId}
            onChange={(e) => { setClassId(e.target.value); setCsId(''); }}
            className={inputClass(!!state.errors?.class_id)}
          >
            <option value="">— Sélectionner —</option>
            {visibleClasses.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <FieldError errors={state.errors?.class_id} />
        </div>

        {/* Class subject */}
        <div>
          <label htmlFor="class_subject_id" className="block text-sm font-medium text-gray-700">Matière <span className="text-red-500">*</span></label>
          <select
            id="class_subject_id" name="class_subject_id" required value={csId}
            onChange={(e) => onSelectCS(e.target.value)}
            disabled={!classId}
            className={inputClass(!!state.errors?.class_subject_id)}
          >
            <option value="">{classId ? '— Sélectionner —' : "Choisissez d'abord une classe"}</option>
            {visibleCS.map((cs) => <option key={cs.id} value={cs.id}>{cs.label}</option>)}
          </select>
          <FieldError errors={state.errors?.class_subject_id} />
        </div>

        {/* Teacher */}
        <div>
          <label htmlFor="teacher_id" className="block text-sm font-medium text-gray-700">Enseignant <span className="font-normal text-gray-400">(optionnel)</span></label>
          <select
            id="teacher_id" name="teacher_id" value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className={inputClass(!!state.errors?.teacher_id)}
          >
            <option value="">— Aucun —</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <FieldError errors={state.errors?.teacher_id} />
        </div>

        {/* Day of week */}
        <div>
          <label htmlFor="day_of_week" className="block text-sm font-medium text-gray-700">Jour <span className="text-red-500">*</span></label>
          <select
            id="day_of_week" name="day_of_week" required defaultValue={initial?.day_of_week ?? 1}
            className={inputClass(!!state.errors?.day_of_week)}
          >
            {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <FieldError errors={state.errors?.day_of_week} />
        </div>

        {/* Room */}
        <div>
          <label htmlFor="room" className="block text-sm font-medium text-gray-700">Salle <span className="font-normal text-gray-400">(optionnel)</span></label>
          <input id="room" name="room" type="text" defaultValue={initial?.room ?? ''} placeholder="ex. Salle 12" className={inputClass(!!state.errors?.room)} />
          <FieldError errors={state.errors?.room} />
        </div>

        {/* Start / end time */}
        <div>
          <label htmlFor="start_time" className="block text-sm font-medium text-gray-700">Début <span className="text-red-500">*</span></label>
          <input id="start_time" name="start_time" type="time" required defaultValue={initial?.start_time ?? '08:00'} className={inputClass(!!state.errors?.start_time)} />
          <FieldError errors={state.errors?.start_time} />
        </div>
        <div>
          <label htmlFor="end_time" className="block text-sm font-medium text-gray-700">Fin <span className="text-red-500">*</span></label>
          <input id="end_time" name="end_time" type="time" required defaultValue={initial?.end_time ?? '09:00'} className={inputClass(!!state.errors?.end_time)} />
          <FieldError errors={state.errors?.end_time} />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notes <span className="font-normal text-gray-400">(optionnel)</span></label>
        <textarea id="notes" name="notes" rows={2} defaultValue={initial?.notes ?? ''} className={inputClass(!!state.errors?.notes)} />
        <FieldError errors={state.errors?.notes} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-sand-100 pt-4">
        <SubmitButton editing={!!slotId} />
        <a href={cancelHref} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</a>
      </div>
    </form>
  )
}
