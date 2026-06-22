'use client'

import { setClassSubjectHours } from './actions'

// Small weekly-hours field that submits on change/blur. Feeds the timetable
// generator (hours_per_week per class-subject).
export function HoursInput({
  classId, classSubjectId, hours, disabled,
}: {
  classId: string; classSubjectId: string; hours: number; disabled: boolean
}) {
  return (
    <form action={setClassSubjectHours} className="flex items-center gap-1">
      <input type="hidden" name="class_id" value={classId} />
      <input type="hidden" name="class_subject_id" value={classSubjectId} />
      <input
        name="hours_per_week"
        type="number"
        min={0}
        max={40}
        defaultValue={hours}
        disabled={disabled}
        aria-label="Heures par semaine"
        onChange={(e) => { if (e.currentTarget.value !== '') e.currentTarget.form?.requestSubmit() }}
        className="w-16 rounded-lg border border-sand-300 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600 disabled:cursor-not-allowed disabled:bg-gray-50"
      />
      <span className="text-xs text-gray-400">h/sem</span>
    </form>
  )
}
