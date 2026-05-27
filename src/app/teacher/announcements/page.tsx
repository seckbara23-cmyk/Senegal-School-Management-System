import { requireTeacherCtx } from '../_auth'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-SN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const AUDIENCE_LABEL: Record<string, string> = {
  all_school: 'École',
  staff:      'Personnel',
  class:      'Classe',
}

const AUDIENCE_COLOR: Record<string, string> = {
  all_school: 'bg-primary-100 text-primary-700',
  staff:      'bg-gray-100 text-gray-600',
  class:      'bg-sky-100 text-sky-700',
}

type AnnouncementRow = {
  id:            string
  title:         string
  body:          string | null
  audience_type: string
  created_at:    string
  classes?:      { name: string } | null
}

export default async function TeacherAnnouncementsPage() {
  const { supabase, schoolId, assignedClassSubjectIds } = await requireTeacherCtx()

  // Resolve class_ids for class-targeted announcement filtering
  let classIds: string[] = []
  if (assignedClassSubjectIds.length > 0) {
    const { data: csData } = await supabase
      .from('class_subjects')
      .select('class_id')
      .in('id', assignedClassSubjectIds)
      .eq('school_id', schoolId)

    classIds = Array.from(new Set(((csData ?? []) as { class_id: string }[]).map((r) => r.class_id)))
  }

  // Fetch broad announcements (all_school + staff) and class-specific in parallel
  const [broadRes, classRes] = await Promise.all([
    supabase
      .from('announcements')
      .select('id, title, body, audience_type, created_at')
      .eq('school_id', schoolId)
      .in('audience_type', ['all_school', 'staff'])
      .order('created_at', { ascending: false })
      .limit(30),

    classIds.length > 0
      ? supabase
          .from('announcements')
          .select('id, title, body, audience_type, created_at, classes!class_id(name)')
          .eq('school_id', schoolId)
          .eq('audience_type', 'class')
          .in('class_id', classIds)
          .order('created_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as AnnouncementRow[] }),
  ])

  // Merge and sort by date
  const merged: AnnouncementRow[] = [
    ...((broadRes.data ?? []) as AnnouncementRow[]),
    ...((classRes.data ?? []) as AnnouncementRow[]),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/teacher" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
        </div>
        <h1 className="text-2xl font-bold text-white">Annonces</h1>
        <p className="mt-0.5 text-sm text-primary-300">
          École · Personnel
          {classIds.length > 0 && ` · Classes assignées (${classIds.length})`}
        </p>
      </div>

      {merged.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune annonce</p>
          <p className="mt-1 text-sm text-gray-400">
            Les annonces publiées pour l&apos;école, le personnel ou vos classes apparaîtront ici.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {merged.map((ann) => {
            const className = (ann.classes as unknown as { name: string } | null)?.name
            return (
              <div key={ann.id} className="rounded-xl border border-sand-200 bg-white px-5 py-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${AUDIENCE_COLOR[ann.audience_type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {AUDIENCE_LABEL[ann.audience_type] ?? ann.audience_type}
                        {className && ` · ${className}`}
                      </span>
                      <span className="text-xs text-gray-400">{fmtDate(ann.created_at)}</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{ann.title}</p>
                    {ann.body && (
                      <p className="mt-1.5 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                        {ann.body}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
