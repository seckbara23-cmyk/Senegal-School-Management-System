import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { PrintButton } from '../_print_button'
import {
  subjectAverage, overallAverage, round2, mention, averageTone, AVERAGE_TEXT_CLASS,
  type WeightedAverage, type GradedItem,
} from '@/lib/grades'

function fmtPrintDate(): string {
  return new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

type Props = { params: { studentId: string } }

export default async function AnnualBulletinPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id, schools!school_id(name, address)')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id
  const schoolMeta = (membership as unknown as { schools: { name: string; address: string | null } | null }).schools
  const schoolName = schoolMeta?.name ?? 'École'
  const schoolAddr = schoolMeta?.address ?? null

  // Student + active enrollment (drives class + academic year).
  const { data: studentData } = await supabase
    .from('students').select('id, first_name, last_name, admission_number')
    .eq('id', params.studentId).eq('school_id', schoolId).maybeSingle()
  if (!studentData) notFound()
  const student = studentData as { id: string; first_name: string; last_name: string; admission_number: string }

  const { data: enrData } = await supabase
    .from('student_class_enrollments')
    .select('class_id, academic_year_id, classes!class_id(name, level), academic_years!academic_year_id(name)')
    .eq('school_id', schoolId).eq('student_id', student.id).eq('status', 'active')
    .order('enrolled_at', { ascending: false })
    .limit(1).maybeSingle()
  type EnrRow = { class_id: string; academic_year_id: string; classes: { name: string; level: string | null } | null; academic_years: { name: string } | null }
  const enrollment = (enrData as unknown as EnrRow | null)
  if (!enrollment) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl bg-primary-800 px-6 py-5">
          <div className="mb-1"><a href={`/school/students/${student.id}`} className="text-primary-300 hover:text-white text-sm">← {student.last_name} {student.first_name}</a></div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Bulletin annuel</h1>
        </div>
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-sm text-gray-500">Cet élève n&apos;a aucune inscription active.</p>
        </div>
      </div>
    )
  }
  const classId = enrollment.class_id
  const yearId = enrollment.academic_year_id

  // Periods, class-subjects, assessments, enrollments, grades for the year.
  const [periodsRes, csRes, enrAllRes] = await Promise.all([
    supabase.from('academic_periods').select('id, name').eq('school_id', schoolId).eq('academic_year_id', yearId).order('starts_on', { ascending: true }),
    supabase.from('class_subjects').select('id, subjects!subject_id(name, code, coefficient)').eq('school_id', schoolId).eq('class_id', classId).eq('academic_year_id', yearId),
    supabase.from('student_class_enrollments').select('student_id').eq('school_id', schoolId).eq('class_id', classId).eq('status', 'active'),
  ])
  type PeriodRow = { id: string; name: string }
  type CsRow = { id: string; subjects: { name: string; code: string | null; coefficient: number | null } | null }
  const periods = (periodsRes.data ?? []) as PeriodRow[]
  const classSubjects = (csRes.data ?? []) as unknown as CsRow[]
  const allStudentIds = ((enrAllRes.data ?? []) as { student_id: string }[]).map((e) => e.student_id)

  type AssessmentRow = { id: string; class_subject_id: string; academic_period_id: string; max_score: number; coefficient: number }
  let assessments: AssessmentRow[] = []
  const csIds = classSubjects.map((c) => c.id)
  if (csIds.length > 0) {
    const { data } = await supabase
      .from('assessments').select('id, class_subject_id, academic_period_id, max_score, coefficient')
      .eq('school_id', schoolId).in('class_subject_id', csIds)
    assessments = (data ?? []) as AssessmentRow[]
  }
  const assessmentIds = assessments.map((a) => a.id)

  const gradeIndex = new Map<string, Map<string, number>>()
  if (assessmentIds.length > 0) {
    const { data: g } = await supabase.from('grades').select('assessment_id, student_id, score').eq('school_id', schoolId).in('assessment_id', assessmentIds)
    for (const r of (g ?? []) as { assessment_id: string; student_id: string; score: number }[]) {
      if (!gradeIndex.has(r.assessment_id)) gradeIndex.set(r.assessment_id, new Map())
      gradeIndex.get(r.assessment_id)!.set(r.student_id, r.score)
    }
  }

  // assessments grouped by class_subject → period, and by class_subject (all year).
  const byCsPeriod = new Map<string, Map<string, AssessmentRow[]>>()
  const byCs = new Map<string, AssessmentRow[]>()
  for (const a of assessments) {
    if (!byCs.has(a.class_subject_id)) byCs.set(a.class_subject_id, [])
    byCs.get(a.class_subject_id)!.push(a)
    if (!byCsPeriod.has(a.class_subject_id)) byCsPeriod.set(a.class_subject_id, new Map())
    const pm = byCsPeriod.get(a.class_subject_id)!
    if (!pm.has(a.academic_period_id)) pm.set(a.academic_period_id, [])
    pm.get(a.academic_period_id)!.push(a)
  }

  const subjAvgForPeriod = (csId: string, periodId: string, sid: string): number | null => {
    const items: GradedItem[] = (byCsPeriod.get(csId)?.get(periodId) ?? []).flatMap((a) => {
      const sc = gradeIndex.get(a.id)?.get(sid)
      return sc !== undefined ? [{ score: sc, maxScore: a.max_score, coefficient: a.coefficient }] : []
    })
    return subjectAverage(items)
  }
  const subjAvgAnnual = (csId: string, sid: string): number | null => {
    const items: GradedItem[] = (byCs.get(csId) ?? []).flatMap((a) => {
      const sc = gradeIndex.get(a.id)?.get(sid)
      return sc !== undefined ? [{ score: sc, maxScore: a.max_score, coefficient: a.coefficient }] : []
    })
    return subjectAverage(items)
  }
  const periodOverall = (periodId: string, sid: string): number | null =>
    overallAverage(classSubjects.map((cs): WeightedAverage => ({ average: subjAvgForPeriod(cs.id, periodId, sid), coefficient: cs.subjects?.coefficient ?? 1 })))
  // Annual average = equal-weighted mean of the year's period overall averages.
  const annualOverall = (sid: string): number | null => {
    const vals = periods.map((p) => periodOverall(p.id, sid)).filter((v): v is number => v !== null)
    return vals.length > 0 ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null
  }

  const myAnnual = annualOverall(student.id)
  // Annual rank within the class.
  let rank: number | null = null
  if (myAnnual !== null) {
    const others = allStudentIds.map((id) => annualOverall(id)).filter((v): v is number => v !== null)
    rank = 1 + others.filter((v) => v > myAnnual).length
  }
  const tone = averageTone(myAnnual)
  const fullName = `${student.last_name} ${student.first_name}`
  const printDate = fmtPrintDate()

  const subjectRows = classSubjects.map((cs) => ({
    id: cs.id,
    name: cs.subjects?.name ?? '—',
    code: cs.subjects?.code ?? null,
    coefficient: cs.subjects?.coefficient ?? 1,
    perPeriod: periods.map((p) => subjAvgForPeriod(cs.id, p.id, student.id)),
    annual: subjAvgAnnual(cs.id, student.id),
  }))

  return (
    <div className="space-y-5">
      {/* Screen-only nav */}
      <div className="print:hidden flex items-center justify-between gap-4">
        <a href={`/school/students/${student.id}`} className="text-sm text-primary-600 hover:text-primary-800 hover:underline">← {fullName}</a>
        <PrintButton />
      </div>

      <div className="rounded-xl border-2 border-primary-200 bg-white shadow-md overflow-hidden print:rounded-none print:shadow-none print:border print:border-gray-700 print:overflow-visible">
        {/* Header */}
        <div className="bg-primary-800 px-6 py-5 text-center print:bg-white print:border-b-2 print:border-gray-700 print:py-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-300 mb-1 print:text-gray-500">République du Sénégal</p>
          <h1 className="text-xl font-bold text-white tracking-tight print:text-gray-900 print:text-2xl">{schoolName}</h1>
          {schoolAddr && <p className="text-primary-400 text-xs mt-0.5 print:text-gray-500">{schoolAddr}</p>}
          <div className="mt-2 inline-block rounded border border-primary-600 px-4 py-1 print:border-gray-700">
            <p className="text-xs font-bold uppercase tracking-widest text-primary-300 print:text-gray-800">Bulletin Annuel</p>
          </div>
        </div>

        {/* Identity */}
        <div className="border-b-2 border-primary-200 bg-primary-50 px-6 py-4 print:bg-white print:border-b print:border-gray-300 print:py-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary-400 mb-0.5 print:text-gray-500">Élève</p>
              <p className="font-bold text-primary-900 print:text-gray-900 text-sm">{fullName}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary-400 mb-0.5 print:text-gray-500">Classe</p>
              <p className="font-semibold text-primary-800 print:text-gray-800 text-sm">{enrollment.classes?.name}{enrollment.classes?.level ? ` — ${enrollment.classes.level}` : ''}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary-400 mb-0.5 print:text-gray-500">Année scolaire</p>
              <p className="font-semibold text-primary-800 print:text-gray-800 text-sm">{enrollment.academic_years?.name}</p>
            </div>
          </div>
        </div>

        {/* Subject table */}
        {subjectRows.length === 0 || periods.length === 0 ? (
          <div className="px-6 py-8 text-center"><p className="text-sm text-gray-500">Aucune matière ou période pour cette année.</p></div>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-sand-100 border-b-2 border-primary-200 text-left print:bg-gray-100 print:border-b print:border-gray-500">
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-700 print:text-gray-700 print:py-2">Matière</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-700 print:text-gray-700 text-center w-12 print:py-2">Coeff</th>
                  {periods.map((p) => (
                    <th key={p.id} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-700 print:text-gray-700 text-right print:py-2">{p.name}</th>
                  ))}
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-700 print:text-gray-700 text-right w-24 print:py-2">Moy. ann.</th>
                </tr>
              </thead>
              <tbody>
                {subjectRows.map((row, idx) => (
                  <tr key={row.id} className={`border-b border-sand-200 print:border-b print:border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50 print:bg-white'}`}>
                    <td className="px-4 py-3 print:py-2">
                      <p className="font-semibold text-gray-900 print:text-sm">{row.name}</p>
                      {row.code && <p className="text-xs text-gray-400 font-mono">{row.code}</p>}
                    </td>
                    <td className="px-4 py-3 text-center print:py-2">
                      <span className="inline-block rounded bg-primary-100 px-1.5 py-0.5 text-xs font-bold text-primary-700 print:rounded-none print:bg-white print:border print:border-gray-400 print:text-gray-800">{row.coefficient}</span>
                    </td>
                    {row.perPeriod.map((v, i) => (
                      <td key={i} className="px-4 py-3 text-right print:py-2 text-gray-600 print:text-gray-800">{v !== null ? `${v}` : '—'}</td>
                    ))}
                    <td className="px-4 py-3 text-right print:py-2">
                      {row.annual !== null ? (
                        <span className={`text-base font-bold print:text-sm print:text-gray-900 ${row.annual >= 10 ? 'text-emerald-700' : 'text-red-600'}`}>{row.annual}<span className="text-gray-300 text-xs print:text-gray-500">/20</span></span>
                      ) : <span className="text-gray-300 text-sm">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary */}
        <div className="border-t-2 border-primary-200 bg-primary-50 px-6 py-5 print:bg-white print:border-t print:border-gray-400 print:py-4">
          <div className="grid grid-cols-3 gap-4 items-center">
            <div className="text-center sm:text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary-400 mb-1 print:text-gray-500">Moyenne annuelle</p>
              {myAnnual !== null ? (
                <p className={`text-3xl font-bold print:text-2xl print:text-gray-900 ${AVERAGE_TEXT_CLASS[tone]}`}>{myAnnual}<span className="text-sm font-normal text-primary-400 ml-0.5 print:text-gray-500">/20</span></p>
              ) : <p className="text-2xl font-bold text-gray-300">—</p>}
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary-400 mb-1 print:text-gray-500">Mention</p>
              {myAnnual !== null ? (
                <span className="inline-block rounded-lg border-2 px-4 py-1.5 text-sm font-bold uppercase tracking-wide border-primary-300 bg-primary-50 text-primary-700 print:rounded-none print:border-gray-700 print:bg-white print:text-gray-900 print:text-base">{mention(myAnnual)}</span>
              ) : <span className="text-gray-300">—</span>}
            </div>
            <div className="text-center sm:text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary-400 mb-1 print:text-gray-500">Rang annuel</p>
              {rank !== null && myAnnual !== null ? (
                <p className="text-2xl font-bold text-primary-800 print:text-gray-900">{rank}<span className="text-sm font-normal text-primary-400 print:text-gray-500">{rank === 1 ? 'er' : 'e'} / {allStudentIds.length}</span></p>
              ) : <p className="text-xl text-gray-300">—</p>}
            </div>
          </div>
        </div>

        {/* Observations */}
        <div className="border-t border-primary-200 bg-white px-6 py-5 print:border-t print:border-gray-300 print:py-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary-400 mb-2 print:text-gray-600">Décision du conseil de classe</p>
          <div className="min-h-[3.5rem] rounded border border-dashed border-primary-200 bg-primary-50/30 px-3 py-2 print:rounded-none print:border print:border-gray-300 print:bg-white print:min-h-[4rem]">
            <p className="text-xs text-gray-300 italic print:hidden">—</p>
          </div>
        </div>

        {/* Signatures */}
        <div className="border-t border-primary-200 bg-white px-6 py-6 print:border-t print:border-gray-300 print:py-5">
          <div className="grid grid-cols-3 gap-6">
            {['Le Directeur / La Directrice', 'Professeur principal(e)', 'Parent / Tuteur légal'].map((label) => (
              <div key={label} className="text-center">
                <p className="text-xs font-semibold text-gray-600 print:text-gray-700 mb-1">{label}</p>
                <div className="h-16 print:h-20" />
                <div className="border-t border-gray-300 mx-2" />
                <p className="text-[10px] text-gray-400 mt-1">Signature{label.startsWith('Le Directeur') ? ' et cachet' : ''}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Print footer */}
        <div className="hidden print:block border-t border-gray-200 px-6 py-2 bg-white">
          <p className="text-[10px] text-gray-400 text-right">Imprimé le {printDate} · {schoolName}</p>
        </div>
      </div>
    </div>
  )
}
