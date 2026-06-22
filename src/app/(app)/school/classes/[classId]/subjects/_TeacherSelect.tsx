'use client'

import { setClassSubjectTeacher } from './actions'

type TeacherOption = { id: string; label: string }

// A teacher dropdown that submits its form on change (no extra button). The
// server action is tenant-scoped and audited.
export function TeacherSelect({
  classId, classSubjectId, teachers, currentTeacherId, disabled,
}: {
  classId: string
  classSubjectId: string
  teachers: TeacherOption[]
  currentTeacherId: string | null
  disabled: boolean
}) {
  return (
    <form action={setClassSubjectTeacher}>
      <input type="hidden" name="class_id" value={classId} />
      <input type="hidden" name="class_subject_id" value={classSubjectId} />
      <select
        name="teacher_id"
        defaultValue={currentTeacherId ?? ''}
        disabled={disabled}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label="Enseignant"
        className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600 disabled:cursor-not-allowed disabled:bg-gray-50"
      >
        <option value="">Non assigné</option>
        {teachers.map((t) => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>
    </form>
  )
}
