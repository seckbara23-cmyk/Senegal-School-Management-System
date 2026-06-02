import { requireStudentCtx } from '../../_auth'
import { computeExamResults, mentionLabel } from '@/lib/exam-results'
import { getPublicationState, isResultVisibleForClasses } from '@/lib/exam-publications'
import { notFound } from 'next/navigation'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const MENTION_CLASS: Record<string, string> = {
  ['Très bien']:   'text-emerald-700',
  Bien:            'text-sky-700',
  ['Assez bien']:  'text-primary-700',
  Passable:        'text-amber-600',
  Insuffisant:     'text-red-600',
}

type Props = { params: { sessionId: string } }

type SessionRow = {
  id: string; name: string; starts_on: string; ends_on: string
  academic_year_id: string; academic_years: { name: string } | null
}

export default async function StudentExamResultPage({ params }: Props) {
  const { supabase, schoolId, student } = await requireStudentCtx()

  const { data: sessionData } = await supabase
    .from('exam_sessions')
    .select('id, name, starts_on, ends_on, academic_year_id, academic_years!academic_year_id(name)')
    .eq('id', params.sessionId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!sessionData) notFound()
  const session = sessionData as unknown as SessionRow

  // Student's active class for this session's academic year.
  const { data: enrData } = await supabase
    .from('student_class_enrollments')
    .select('class_id, classes!class_id(academic_year_id)')
    .eq('student_id', student.id)
    .eq('school_id', schoolId)
    .eq('status', 'active')

  type EnrRow = { class_id: string; classes: { academic_year_id: string } | null }
  const enrollments = (enrData ?? []) as unknown as EnrRow[]
  const enrollment = enrollments.find((e) => e.classes?.academic_year_id === session.academic_year_id) ?? null
  if (!enrollment) notFound()
  const classId = enrollment.class_id

  // Visibility gate — only published results (RLS returns published rows only).
  const pubState = await getPublicationState(supabase, schoolId, session.id)
  if (!isResultVisibleForClasses(pubState, [classId])) notFound()

  const results = await computeExamResults(supabase, schoolId, session.academic_year_id, session.id, classId)
  const cls = results.classes[0] ?? null
  const myRow = cls?.students.find((s) => s.studentId === student.id) ?? null

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/student/exams" className="text-primary-300 hover:text-white text-sm">← Résultats d&apos;examen</a>
        </div>
        <h1 className="text-2xl font-bold text-white">{session.name}</h1>
        <p className="mt-0.5 text-sm text-primary-300">
          {session.academic_years?.name ?? ''} · {fmtDate(session.starts_on)} – {fmtDate(session.ends_on)}
        </p>
      </div>

      {!myRow || myRow.average === null ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune note disponible</p>
          <p className="mt-1 text-sm text-gray-400">Aucune note n&apos;a encore été saisie pour vous dans cette session.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 overflow-hidden rounded-xl shadow-sm">
            <div className="bg-primary-700 px-4 py-4 text-center">
              <p className="text-2xl font-bold text-white">{myRow.average}<span className="text-sm text-white/50">/20</span></p>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-0.5">Moyenne</p>
            </div>
            <div className="bg-primary-600 px-4 py-4 text-center">
              <p className="text-2xl font-bold text-white">{myRow.rank !== null ? `${myRow.rank}${myRow.rank === 1 ? 'er' : 'e'}` : '—'}</p>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-0.5">Rang</p>
            </div>
            <div className="bg-emerald-600 px-4 py-4 text-center">
              <p className="text-2xl font-bold text-white">{results.summary.average ?? '—'}</p>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200 mt-0.5">Moy. classe</p>
            </div>
          </div>

          <div className="rounded-xl border border-sand-200 bg-white shadow-sm px-5 py-4 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">Appréciation</span>
            <span className={`text-base font-bold ${MENTION_CLASS[myRow.mention ?? ''] ?? 'text-gray-600'}`}>
              {myRow.mention ?? mentionLabel(myRow.average)}
            </span>
          </div>

          {myRow.missing > 0 && (
            <p className="text-center text-xs text-amber-600">
              {myRow.missing} note(s) encore manquante(s) ({myRow.gradedCount}/{myRow.expected} saisies).
            </p>
          )}
        </>
      )}
    </div>
  )
}
