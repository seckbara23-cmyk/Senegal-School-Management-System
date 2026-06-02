import { requireParentCtx } from '../_auth'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  father: 'Père', mother: 'Mère', guardian: 'Tuteur', other: 'Autre',
}

type ChildRow = {
  student_id: string; relationship: string
  students: { id: string; first_name: string; last_name: string }
}
type PubRow = { exam_session_id: string; class_id: string | null }
type SessionRow = {
  id: string; name: string; starts_on: string; ends_on: string
  academic_years: { name: string } | null
}

export default async function ParentExamsPage({ searchParams }: { searchParams: { child?: string } }) {
  const { supabase, schoolId, parent } = await requireParentCtx()

  const { data: linksData } = await supabase
    .from('parent_student_links')
    .select('student_id, relationship, students!student_id(id, first_name, last_name)')
    .eq('parent_id', parent.id)
  const links = (linksData ?? []) as unknown as ChildRow[]

  if (links.length === 0) {
    return (
      <div className="space-y-6 pb-8">
        <div className="rounded-xl bg-primary-800 px-6 py-5">
          <a href="/parent" className="text-primary-300 hover:text-white text-sm">← Accueil</a>
          <h1 className="mt-1 text-2xl font-bold text-white">Résultats d&apos;examen</h1>
        </div>
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun enfant lié</p>
        </div>
      </div>
    )
  }

  const validIds = new Set(links.map((l) => l.student_id))
  const selectedChildId = searchParams.child && validIds.has(searchParams.child) ? searchParams.child : links[0].student_id
  const selectedLink = links.find((l) => l.student_id === selectedChildId)!

  // Selected child's active classes.
  const { data: enrData } = await supabase
    .from('student_class_enrollments')
    .select('class_id')
    .eq('student_id', selectedChildId)
    .eq('school_id', schoolId)
    .eq('status', 'active')
  const classIds = new Set(((enrData ?? []) as { class_id: string }[]).map((e) => e.class_id))

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
          <a href="/parent" className="text-primary-300 hover:text-white text-sm">← Accueil</a>
        </div>
        <h1 className="text-2xl font-bold text-white">Résultats d&apos;examen</h1>
        <p className="mt-0.5 text-sm text-primary-300">{selectedLink.students.first_name} · sessions publiées</p>
      </div>

      {links.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <a
              key={link.student_id}
              href={`/parent/exams?child=${link.student_id}`}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                link.student_id === selectedChildId
                  ? 'bg-primary-700 text-white shadow-sm'
                  : 'bg-white border border-sand-200 text-gray-700 hover:bg-sand-100'
              }`}
            >
              {link.students.first_name}
              <span className="ml-1.5 text-xs font-normal opacity-60">{RELATIONSHIP_LABELS[link.relationship] ?? link.relationship}</span>
            </a>
          ))}
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun résultat publié</p>
          <p className="mt-1 text-sm text-gray-400">Les résultats d&apos;examen apparaîtront ici dès leur publication.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <ul className="divide-y divide-sand-100">
            {sessions.map((s) => (
              <li key={s.id}>
                <a href={`/parent/exams/${s.id}?child=${selectedChildId}`} className="flex items-center justify-between gap-3 bg-white px-5 py-4 hover:bg-sand-50 transition-colors">
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
