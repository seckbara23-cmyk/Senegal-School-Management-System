import { requireStudentCtx } from '../_auth'

export const dynamic = 'force-dynamic'

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'Sans échéance'
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' })
}

export default async function StudentHomeworkPage() {
  const { supabase, schoolId, student } = await requireStudentCtx()

  const { data: yr } = await supabase.from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle()
  const yearId = (yr as { id: string } | null)?.id

  let classId: string | null = null
  if (yearId) {
    const { data: enr } = await supabase
      .from('student_class_enrollments').select('class_id')
      .eq('school_id', schoolId).eq('student_id', student.id).eq('academic_year_id', yearId).eq('status', 'active')
      .limit(1).maybeSingle()
    classId = (enr as { class_id: string } | null)?.class_id ?? null
  }

  const today = new Date().toISOString().slice(0, 10)
  type HwRow = { id: string; title: string; description: string | null; due_date: string | null; subjectName: string }
  let homework: HwRow[] = []
  if (classId) {
    const { data } = await supabase
      .from('homework')
      .select('id, title, description, due_date, class_subjects!class_subject_id(subjects!subject_id(name))')
      .eq('school_id', schoolId).eq('class_id', classId)
      .order('due_date', { ascending: true, nullsFirst: false })
    homework = ((data ?? []) as unknown as { id: string; title: string; description: string | null; due_date: string | null; class_subjects: unknown }[]).map((r) => {
      const cs = one<{ subjects: unknown }>(r.class_subjects as never)
      const subj = one<{ name: string }>(cs?.subjects as never)
      return { id: r.id, title: r.title, description: r.description, due_date: r.due_date, subjectName: subj?.name ?? '—' }
    })
  }

  const upcoming = homework.filter((h) => !h.due_date || h.due_date >= today)
  const past = homework.filter((h) => h.due_date && h.due_date < today).reverse()

  const Card = (h: HwRow) => (
    <div key={h.id} className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{h.title}</p>
          <p className="text-xs text-gray-400">{h.subjectName}</p>
        </div>
        <span className="shrink-0 rounded-full border border-sand-200 bg-sand-50 px-2.5 py-0.5 text-xs font-medium text-gray-600">{fmtDate(h.due_date)}</span>
      </div>
      {h.description && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{h.description}</p>}
    </div>
  )

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Devoirs</h1>
        <p className="text-sm text-gray-500">Tes devoirs à rendre.</p>
      </div>

      {homework.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-14 text-center">
          <p className="text-sm font-medium text-gray-900">Aucun devoir</p>
          <p className="mt-1 text-sm text-gray-500">Les devoirs publiés par tes enseignants apparaîtront ici.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">À venir ({upcoming.length})</h2>
            {upcoming.length > 0 ? upcoming.map(Card) : <p className="text-sm text-gray-400">Aucun devoir à venir.</p>}
          </section>
          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Passés ({past.length})</h2>
              {past.map(Card)}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
