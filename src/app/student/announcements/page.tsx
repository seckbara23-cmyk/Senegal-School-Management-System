import { requireStudentCtx } from '../_auth'

const AUDIENCE_LABELS: Record<string, string> = {
  all_school: 'Toute l\'école',
  parents:    'Parents',
  students:   'Élèves',
  staff:      'Personnel',
  class:      'Classe',
}

const AUDIENCE_COLORS: Record<string, string> = {
  all_school: 'bg-primary-100 text-primary-700',
  parents:    'bg-accent-100 text-accent-700',
  students:   'bg-emerald-100 text-emerald-700',
  staff:      'bg-gray-100 text-gray-600',
  class:      'bg-sky-100 text-sky-700',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-SN', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function StudentAnnouncementsPage() {
  const { supabase, schoolId, student } = await requireStudentCtx()

  // Student's active class enrollment (for class-specific announcements)
  const { data: enrData } = await supabase
    .from('student_class_enrollments')
    .select('class_id')
    .eq('student_id', student.id)
    .eq('school_id', schoolId)
    .eq('status', 'active')
  const classIds = (enrData ?? []).map((e) => (e as { class_id: string }).class_id)

  const { data: rawAnn } = await supabase
    .from('announcements')
    .select('id, title, body, audience_type, class_id, created_at, classes!class_id(name)')
    .eq('school_id', schoolId)
    .in('audience_type', ['all_school', 'students', 'class'])
    .order('created_at', { ascending: false })
    .limit(60)

  type AnnRow = {
    id: string; title: string; body: string; audience_type: string
    class_id: string | null; created_at: string; classes: { name: string } | null
  }
  const rows = (rawAnn ?? []) as unknown as AnnRow[]

  const announcements = rows.filter((a) =>
    a.audience_type !== 'class' || (a.class_id !== null && classIds.includes(a.class_id))
  )

  return (
    <div className="space-y-6 pb-8">

      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/student" className="text-primary-300 hover:text-white text-sm">← Accueil</a>
        </div>
        <h1 className="text-2xl font-bold text-white">Annonces</h1>
        <p className="mt-0.5 text-sm text-primary-300">
          {announcements.length} annonce{announcements.length !== 1 ? 's' : ''}
        </p>
      </div>

      {announcements.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune annonce pour le moment</p>
          <p className="mt-1 text-sm text-gray-400">Les nouvelles annonces apparaîtront ici.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((ann) => (
            <div key={ann.id} className="rounded-xl border border-sand-200 bg-white shadow-sm px-5 py-5">
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${AUDIENCE_COLORS[ann.audience_type] ?? 'bg-gray-100 text-gray-600'}`}>
                  {ann.audience_type === 'class' && ann.classes
                    ? ann.classes.name
                    : (AUDIENCE_LABELS[ann.audience_type] ?? ann.audience_type)}
                </span>
                <span className="text-xs text-gray-400">{fmtDate(ann.created_at)}</span>
              </div>
              <h2 className="text-base font-bold text-gray-900">{ann.title}</h2>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{ann.body}</p>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
