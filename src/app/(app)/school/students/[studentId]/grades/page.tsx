import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import {
  subjectAverage, overallAverage, normalize20, round2, averageTone, mention,
  AVERAGE_TEXT_CLASS, type GradedItem,
} from '@/lib/grades'

const TYPE_LABEL: Record<string, string> = {
  devoir: 'Devoir', composition: 'Composition', examen: 'Examen', participation: 'Participation', autre: 'Autre',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

type GradeRow = {
  score: number
  comment: string | null
  assessments: {
    id: string
    title: string
    assessment_type: string
    assessment_date: string | null
    max_score: number
    coefficient: number
    class_subjects: { subjects: { name: string; coefficient: number | null } | null } | null
    academic_periods: { name: string } | null
  } | null
}

type Props = { params: { studentId: string } }

export default async function StudentGradesPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: studentData } = await supabase
    .from('students')
    .select('id, first_name, last_name, admission_number')
    .eq('id', params.studentId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!studentData) notFound()
  const student = studentData as { id: string; first_name: string; last_name: string; admission_number: string }

  const { data: gradeData } = await supabase
    .from('grades')
    .select('score, comment, assessments!assessment_id(id, title, assessment_type, assessment_date, max_score, coefficient, class_subjects!class_subject_id(subjects!subject_id(name, coefficient)), academic_periods!academic_period_id(name))')
    .eq('student_id', student.id)
    .eq('school_id', schoolId)
    .limit(500)
  const grades = (gradeData ?? []) as unknown as GradeRow[]

  // History rows (most recent first).
  const history = grades
    .filter((g) => g.assessments)
    .map((g) => {
      const a = g.assessments!
      return {
        subject: a.class_subjects?.subjects?.name ?? '—',
        title:   a.title,
        type:    a.assessment_type,
        period:  a.academic_periods?.name ?? '—',
        date:    a.assessment_date,
        score:   g.score,
        max:     a.max_score,
        comment: g.comment,
      }
    })
    .sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''))

  // Per-subject averages.
  type SubjAcc = { name: string; coefficient: number; items: GradedItem[] }
  const bySubject = new Map<string, SubjAcc>()
  for (const g of grades) {
    const a = g.assessments
    const subj = a?.class_subjects?.subjects
    if (!a || !subj) continue
    const key = subj.name
    if (!bySubject.has(key)) bySubject.set(key, { name: subj.name, coefficient: subj.coefficient ?? 1, items: [] })
    bySubject.get(key)!.items.push({ score: g.score, maxScore: a.max_score, coefficient: a.coefficient })
  }
  const subjectRows = Array.from(bySubject.values())
    .map((s) => ({ name: s.name, coefficient: s.coefficient, average: subjectAverage(s.items), count: s.items.length }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const overall = overallAverage(subjectRows.map((s) => ({ average: s.average, coefficient: s.coefficient })))
  const overallTone = averageTone(overall)

  const fullName = `${student.last_name} ${student.first_name}`

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href={`/school/students/${student.id}`} className="text-primary-300 hover:text-white text-sm">← {fullName}</a>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Notes — {fullName}</h1>
            <p className="text-primary-300 text-sm mt-0.5 font-mono">{student.admission_number}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-primary-300">Moyenne générale</p>
            <p className="text-2xl font-bold text-white">{overall !== null ? `${overall}/20` : '—'}</p>
            {overall !== null && <p className="text-xs text-accent-300">{mention(overall)}</p>}
          </div>
        </div>
      </div>

      {/* Subject averages */}
      <section className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
        <div className="border-b border-sand-100 bg-sand-50 px-5 py-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-primary-700">Moyennes par matière</h2>
        </div>
        {subjectRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">Aucune note pour cet élève.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-100 text-left">
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Matière</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Coeff.</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Notes</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Moyenne</th>
                </tr>
              </thead>
              <tbody>
                {subjectRows.map((s, idx) => {
                  const tone = averageTone(s.average)
                  return (
                    <tr key={s.name} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{s.coefficient}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{s.count}</td>
                      <td className={`px-4 py-3 text-right font-bold ${AVERAGE_TEXT_CLASS[tone]}`}>{s.average !== null ? `${s.average}/20` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Grade history */}
      <section className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
        <div className="border-b border-sand-100 bg-sand-50 px-5 py-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-primary-700">Historique des notes</h2>
        </div>
        {history.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">Aucune note enregistrée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-100 text-left">
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Matière</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Évaluation</th>
                  <th className="hidden px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">Période</th>
                  <th className="hidden px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">Date</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Note</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, idx) => (
                  <tr key={idx} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{h.subject}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {h.title}
                      <span className="ml-1.5 rounded bg-sand-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">{TYPE_LABEL[h.type] ?? h.type}</span>
                    </td>
                    <td className="hidden px-4 py-3 text-gray-500 sm:table-cell">{h.period}</td>
                    <td className="hidden px-4 py-3 text-gray-500 md:table-cell">{fmtDate(h.date)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-gray-900">{h.score}</span>
                      <span className="text-gray-400">/{h.max}</span>
                      <span className="ml-1 text-xs text-gray-400">({round2(normalize20(h.score, h.max))}/20)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
