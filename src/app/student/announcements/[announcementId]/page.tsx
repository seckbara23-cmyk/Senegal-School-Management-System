import { requireStudentCtx } from '../../_auth'
import { notFound } from 'next/navigation'

const AUDIENCE_LABELS: Record<string, string> = {
  all_school: "Toute l'école", parents: 'Parents', students: 'Élèves', staff: 'Personnel', class: 'Classe',
}
const AUDIENCE_COLORS: Record<string, string> = {
  all_school: 'bg-primary-100 text-primary-700',
  parents:    'bg-accent-100 text-accent-700',
  students:   'bg-emerald-100 text-emerald-700',
  staff:      'bg-gray-100 text-gray-600',
  class:      'bg-sky-100 text-sky-700',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-SN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

type Props = { params: { announcementId: string } }

export default async function StudentAnnouncementDetailPage({ params }: Props) {
  const { supabase, schoolId, student } = await requireStudentCtx()

  const { data: rawAnn } = await supabase
    .from('announcements')
    .select('id, title, body, audience_type, class_id, created_at, classes!class_id(name)')
    .eq('id', params.announcementId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!rawAnn) notFound()
  type Ann = {
    id: string; title: string; body: string | null; audience_type: string
    class_id: string | null; created_at: string; classes: { name: string } | null
  }
  const ann = rawAnn as unknown as Ann

  // Access: all_school / students, or the student's own enrolled class.
  let allowed = ann.audience_type === 'all_school' || ann.audience_type === 'students'
  if (!allowed && ann.audience_type === 'class' && ann.class_id) {
    const { data: enr } = await supabase
      .from('student_class_enrollments')
      .select('class_id')
      .eq('school_id', schoolId)
      .eq('student_id', student.id)
      .eq('status', 'active')
      .eq('class_id', ann.class_id)
      .limit(1)
    allowed = (enr ?? []).length > 0
  }
  if (!allowed) notFound()

  const label = ann.audience_type === 'class' && ann.classes
    ? ann.classes.name
    : (AUDIENCE_LABELS[ann.audience_type] ?? ann.audience_type)

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/student/announcements" className="text-primary-300 hover:text-white text-sm">← Annonces</a>
        </div>
        <h1 className="text-2xl font-bold text-white">{ann.title}</h1>
      </div>

      <article className="rounded-xl border border-sand-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-100 pb-3">
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${AUDIENCE_COLORS[ann.audience_type] ?? 'bg-gray-100 text-gray-600'}`}>
            {label}
          </span>
          <span className="text-xs text-gray-400 capitalize">{fmtDate(ann.created_at)}</span>
        </div>
        {ann.body ? (
          <p className="mt-4 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{ann.body}</p>
        ) : (
          <p className="mt-4 text-sm italic text-gray-400">Aucun contenu.</p>
        )}
      </article>
    </div>
  )
}
