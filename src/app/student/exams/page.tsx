import { requireStudentCtx } from '../_auth'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

type PubRow = { exam_session_id: string; class_id: string | null }
type SessionRow = {
  id: string; name: string; starts_on: string; ends_on: string
  academic_years: { name: string } | null
}

export default async function StudentExamsPage() {
  const { supabase, schoolId, student } = await requireStudentCtx()

  // Classes the student is actively enrolled in.
  const { data: enrData } = await supabase
    .from('student_class_enrollments')
    .select('class_id')
    .eq('student_id', student.id)
    .eq('school_id', schoolId)
    .eq('status', 'active')
  const classIds = new Set(((enrData ?? []) as { class_id: string }[]).map((e) => e.class_id))

  // Published publications (RLS already restricts to published rows of this school).
  const { data: pubData } = await supabase
    .from('exam_result_publications')
    .select('exam_session_id, class_id')
    .eq('school_id', schoolId)
    .eq('status', 'published')

  const visibleSessionIds = new Set<string>()
  for (const p of (pubData ?? []) as PubRow[]) {
    if (p.class_id === null || classIds.has(p.class_id)) visibleSessionIds.add(p.exam_session_id)
  }

  let sessions: SessionRow[] = []
  if (visibleSessionIds.size > 0) {
    const { data: sData } = await supabase
      .from('exam_sessions')
      .select('id, name, starts_on, ends_on, academic_years!academic_year_id(name)')
      .eq('school_id', schoolId)
      .in('id', Array.from(visibleSessionIds))
      .order('starts_on', { ascending: false })
    sessions = (sData ?? []) as unknown as SessionRow[]
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/student" className="text-primary-300 hover:text-white text-sm">← Accueil</a>
        </div>
        <h1 className="text-2xl font-bold text-white">Résultats d&apos;examen</h1>
        <p className="mt-0.5 text-sm text-primary-300">Sessions dont les résultats ont été publiés.</p>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun résultat publié</p>
          <p className="mt-1 text-sm text-gray-400">Vos résultats d&apos;examen apparaîtront ici dès leur publication.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <ul className="divide-y divide-sand-100">
            {sessions.map((s) => (
              <li key={s.id}>
                <a href={`/student/exams/${s.id}`} className="flex items-center justify-between gap-3 bg-white px-5 py-4 hover:bg-sand-50 transition-colors">
                  <div>
                    <p className="font-semibold text-gray-900">{s.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {s.academic_years?.name ?? ''} · {fmtDate(s.starts_on)} – {fmtDate(s.ends_on)}
                    </p>
                  </div>
                  <span className="text-primary-600 text-sm font-medium whitespace-nowrap">Voir →</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
