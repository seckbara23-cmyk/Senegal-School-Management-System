import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { addClassSubject, removeClassSubject } from './actions'
import { TeacherSelect } from './_TeacherSelect'
import { HoursInput } from './_HoursInput'

const OK_MESSAGES: Record<string, string> = {
  added:   'Matière ajoutée à la classe.',
  teacher: 'Enseignant mis à jour.',
  hours:   'Heures par semaine mises à jour.',
  removed: 'Matière retirée de la classe.',
}

const ERROR_MESSAGES: Record<string, string> = {
  readonly:  'Cet établissement est en lecture seule. Les modifications sont désactivées.',
  invalid:   'Sélection invalide.',
  duplicate: 'Cette matière est déjà assignée à la classe.',
  in_use:    'Cette matière est utilisée dans l’emploi du temps ou des évaluations. Retirez-les d’abord.',
  server:    'Une erreur est survenue. Veuillez réessayer.',
}

type ClassRow = {
  id: string
  name: string
  section: string | null
  academic_year_id: string
  academic_years: { name: string; is_active: boolean } | null
}

type Props = { params: { classId: string }; searchParams: { ok?: string; error?: string } }

export default async function ClassSubjectsPage({ params, searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  // Class must belong to this school.
  const { data: rawClass } = await supabase
    .from('classes')
    .select('id, name, section, academic_year_id, academic_years!academic_year_id(name, is_active)')
    .eq('id', params.classId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!rawClass) notFound()
  const cls = rawClass as unknown as ClassRow

  // Subjects catalogue, current class-subjects (+teacher), and teachers.
  const [subjectsRes, csRes, teachersRes] = await Promise.all([
    supabase.from('subjects').select('id, name, code').eq('school_id', schoolId).order('name'),
    supabase
      .from('class_subjects')
      .select('id, subject_id, hours_per_week, subjects!subject_id(name, code), teacher_subject_assignments!class_subject_id(teacher_id)')
      .eq('class_id', cls.id).eq('school_id', schoolId),
    supabase.from('teachers').select('id, first_name, last_name').eq('school_id', schoolId).eq('status', 'active').order('last_name'),
  ])

  // teacher_subject_assignments has UNIQUE(class_subject_id) → PostgREST embeds
  // it as to-ONE (object | null), not an array. Normalise before reading.
  type TeacherEmbed = { teacher_id: string }
  type CSRow = {
    id: string
    subject_id: string
    hours_per_week: number | null
    subjects: { name: string; code: string | null } | null
    teacher_subject_assignments: TeacherEmbed | TeacherEmbed[] | null
  }
  const classSubjects = ((csRes.data ?? []) as unknown as CSRow[])
    .map((cs) => {
      const tsa = cs.teacher_subject_assignments
      const teacherRow = Array.isArray(tsa) ? tsa[0] : tsa
      return {
        id: cs.id,
        subject_id: cs.subject_id,
        name: cs.subjects?.name ?? 'Matière',
        code: cs.subjects?.code ?? null,
        teacher_id: teacherRow?.teacher_id ?? null,
        hours_per_week: cs.hours_per_week ?? 1,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const assignedIds = new Set(classSubjects.map((cs) => cs.subject_id))
  const available = ((subjectsRes.data ?? []) as { id: string; name: string; code: string | null }[])
    .filter((s) => !assignedIds.has(s.id))

  const teachers = ((teachersRes.data ?? []) as { id: string; first_name: string; last_name: string }[])
    .map((t) => ({ id: t.id, label: `${t.last_name} ${t.first_name}` }))

  const displayName = [cls.name, cls.section].filter(Boolean).join(' — ')
  const okMessage    = searchParams.ok ? (OK_MESSAGES[searchParams.ok] ?? '') : ''
  const errorMessage = searchParams.error ? (ERROR_MESSAGES[searchParams.error] ?? '') : ''

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href={`/school/classes/${cls.id}`} className="text-primary-300 hover:text-white text-sm">← {displayName}</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Matières de la classe</h1>
        <p className="text-primary-300 text-sm mt-0.5">{displayName} · {cls.academic_years?.name ?? ''}{cls.academic_years?.is_active ? ' (année en cours)' : ''}</p>
      </div>

      {okMessage && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{okMessage}</div>
      )}
      {errorMessage && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      )}

      {/* Add a subject */}
      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-5 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Ajouter une matière</p>
        </div>
        <div className="px-5 py-4">
          {available.length === 0 ? (
            <p className="text-sm text-gray-500">
              {(subjectsRes.data ?? []).length === 0
                ? <>Aucune matière n’existe encore. <a href="/school/academics/subjects" className="text-primary-600 hover:underline">Créez des matières</a> d’abord.</>
                : 'Toutes les matières disponibles sont déjà assignées à cette classe.'}
            </p>
          ) : (
            <form action={addClassSubject} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="class_id" value={cls.id} />
              <div className="flex-1 min-w-[14rem]">
                <label htmlFor="subject_id" className="block text-xs font-medium text-gray-600 mb-1">Matière</label>
                <select id="subject_id" name="subject_id" required defaultValue=""
                  className="block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600">
                  <option value="" disabled>— Choisir une matière —</option>
                  {available.map((s) => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
                </select>
              </div>
              <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 transition-colors">
                Ajouter
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Assigned subjects + teacher */}
      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-5 py-3 flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Matières assignées</p>
          <span className="text-xs text-gray-400">{classSubjects.length} matière{classSubjects.length !== 1 ? 's' : ''}</span>
        </div>
        {classSubjects.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">
            Aucune matière assignée. Ajoutez-en ci-dessus pour pouvoir programmer l’emploi du temps et saisir les notes.
          </p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {classSubjects.map((cs) => (
              <li key={cs.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{cs.name}</p>
                  {cs.code && <p className="text-xs font-mono text-gray-400">{cs.code}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <HoursInput classId={cls.id} classSubjectId={cs.id} hours={cs.hours_per_week} disabled={false} />
                  <TeacherSelect
                    classId={cls.id}
                    classSubjectId={cs.id}
                    teachers={teachers}
                    currentTeacherId={cs.teacher_id}
                    disabled={false}
                  />
                  <form action={removeClassSubject}>
                    <input type="hidden" name="class_id" value={cls.id} />
                    <input type="hidden" name="class_subject_id" value={cs.id} />
                    <button type="submit" className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
                      Retirer
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Astuce : une fois les matières et enseignants assignés, ils apparaissent dans{' '}
        <a href="/school/timetable/new" className="text-primary-600 hover:underline">l’emploi du temps</a> pour cette classe.
      </p>
    </div>
  )
}
