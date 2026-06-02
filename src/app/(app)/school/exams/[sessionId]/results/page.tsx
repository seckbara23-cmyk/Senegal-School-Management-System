import { PrintButton } from '@/components/PrintButton'
import { computeExamResults } from '@/lib/exam-results'
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'

const UUID_RE = /^[0-9a-fA-F-]{36}$/

const MENTION_CLASS: Record<string, string> = {
  ['Tr\u00e8s bien']: 'bg-emerald-100 text-emerald-700',
  Bien: 'bg-sky-100 text-sky-700',
  ['Assez bien']: 'bg-primary-100 text-primary-700',
  Passable: 'bg-amber-100 text-amber-700',
  Insuffisant: 'bg-red-100 text-red-700',
}

type Props = {
  params: { sessionId: string }
  searchParams: { class?: string }
}

type SessionRow = {
  id: string
  name: string
  starts_on: string
  ends_on: string
  academic_year_id: string
  academic_years: { name: string } | null
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function ExamResultsPage({ params, searchParams }: Props) {
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

  const { data: sessionData } = await supabase
    .from('exam_sessions')
    .select('id, name, starts_on, ends_on, academic_year_id, academic_years!academic_year_id(name)')
    .eq('id', params.sessionId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!sessionData) notFound()
  const session = sessionData as unknown as SessionRow

  const classFilter = searchParams.class?.trim() || null
  if (classFilter && !UUID_RE.test(classFilter)) notFound()

  if (classFilter) {
    const { data: selectedClass } = await supabase
      .from('classes')
      .select('id')
      .eq('id', classFilter)
      .eq('school_id', schoolId)
      .eq('academic_year_id', session.academic_year_id)
      .maybeSingle()

    if (!selectedClass) notFound()
  }

  const results = await computeExamResults(
    supabase,
    schoolId,
    session.academic_year_id,
    session.id,
    classFilter,
  )

  const exportParams = new URLSearchParams({ session: session.id })
  if (classFilter) exportParams.set('class', classFilter)

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-primary-800 px-6 py-5 print:hidden">
        <div className="mb-1">
          <a href={`/school/exams/${session.id}`} className="text-primary-300 hover:text-white text-sm">
            &larr; Session
          </a>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              R&eacute;sultats - {session.name}
            </h1>
            <p className="text-primary-300 text-sm mt-0.5">
              {session.academic_years?.name ?? ''} &middot; {fmtDate(session.starts_on)} - {fmtDate(session.ends_on)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/exams/export/results?${exportParams.toString()}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-sand-50 transition-colors"
            >
              Exporter CSV
            </a>
            <PrintButton />
          </div>
        </div>
      </div>

      {results.classOptions.length > 0 && (
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-4 print:hidden">
          <div className="min-w-[200px]">
            <label htmlFor="class" className="block text-xs font-medium text-gray-600 mb-1">
              Classe
            </label>
            <select
              id="class"
              name="class"
              defaultValue={classFilter ?? ''}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
            >
              <option value="">Toutes les classes</option>
              {results.classOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">
            Afficher
          </button>
        </form>
      )}

      {results.classes.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun r&eacute;sultat</p>
          <p className="mt-1 text-sm text-gray-400">
            Aucune &eacute;valuation n&apos;est rattach&eacute;e &agrave; cette session pour la s&eacute;lection courante.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl grid grid-cols-2 sm:grid-cols-5 shadow-sm">
            <SummaryCard tone="bg-primary-600" value={results.summary.students} label="Eleves" />
            <SummaryCard tone="bg-primary-700" value={results.summary.gradedStudents} label="Notes" />
            <SummaryCard tone="bg-sky-600" value={results.summary.average ?? '-'} label="Moyenne" />
            <SummaryCard tone="bg-emerald-600" value={results.summary.passRate !== null ? `${results.summary.passRate}%` : '-'} label="Reussite" />
            <SummaryCard
              tone={results.summary.missingGrades > 0 ? 'bg-amber-500' : 'bg-gray-500'}
              value={results.summary.missingGrades}
              label="Notes manquantes"
              className="col-span-2 sm:col-span-1"
            />
          </div>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Avancement de la saisie</h2>
            <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sand-200 bg-sand-100 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Classe</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Mati&egrave;re</th>
                    <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Enseignant</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Saisi</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {results.completion.map((row, index) => {
                    const percent = row.expected > 0 ? Math.round((row.graded / row.expected) * 100) : 0
                    return (
                      <tr key={row.csId} className={`border-b border-sand-100 ${index % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                        <td className="px-4 py-3 text-gray-700">{row.className}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{row.subject}</td>
                        <td className="hidden sm:table-cell px-4 py-3 text-gray-600">{row.teacher ?? '-'}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{row.graded}/{row.expected}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold ${percent >= 100 ? 'text-emerald-700' : percent > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                            {percent}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {results.classes.map((cls) => (
            <section key={cls.classId}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                R&eacute;sultats - {cls.className}
              </h2>

              <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sand-200 bg-primary-800 text-left">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-center w-12">Rang</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Eleve</th>
                      <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Matricule</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Moyenne</th>
                      <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Mention</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-center">Saisie</th>
                      <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-center">Compl.</th>
                      <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-center">Manquantes</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cls.students.map((student, index) => (
                      <tr key={student.studentId} className={`border-b border-sand-100 ${index % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                        <td className="px-4 py-3 text-center font-semibold text-gray-700">{student.rank ?? '-'}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <a href={`/school/students/${student.studentId}`} className="hover:text-primary-700 hover:underline">
                            {student.name}
                          </a>
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3 font-mono text-xs text-gray-500">{student.admission}</td>
                        <td className="px-4 py-3 text-right">
                          {student.average !== null ? (
                            <span className={`font-bold ${student.average >= 10 ? 'text-emerald-700' : 'text-red-600'}`}>
                              {student.average}<span className="text-gray-300 text-xs">/20</span>
                            </span>
                          ) : (
                            <span className="text-xs italic text-gray-400">Non not&eacute;</span>
                          )}
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3">
                          {student.mention ? (
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${MENTION_CLASS[student.mention] ?? 'bg-gray-100 text-gray-600'}`}>
                              {student.mention}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-medium ${student.missing === 0 && student.expected > 0 ? 'text-emerald-700' : 'text-gray-500'}`}>
                            {student.gradedCount}/{student.expected}
                          </span>
                          {student.missing > 0 && <span className="ml-1 text-[11px] text-amber-600">({student.missing} manq.)</span>}
                        </td>
                        <td className="hidden md:table-cell px-4 py-3 text-center">
                          <span className={`text-xs font-semibold ${student.completion >= 100 ? 'text-emerald-700' : student.completion > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                            {student.completion}%
                          </span>
                        </td>
                        <td className="hidden md:table-cell px-4 py-3 text-center">{student.missing}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <a href={`/school/students/${student.studentId}/progress`} className="text-xs font-medium text-primary-600 hover:text-primary-800 hover:underline">
                            Progression &rarr;
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  )
}

function SummaryCard({
  tone,
  value,
  label,
  className = '',
}: {
  tone: string
  value: number | string
  label: string
  className?: string
}) {
  return (
    <div className={`${tone} ${className} px-4 py-4 text-center`}>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/80 mt-1">{label}</p>
    </div>
  )
}
