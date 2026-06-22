import { requireParentCtx } from '../_auth'

export const dynamic = 'force-dynamic'

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'Sans échéance'
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' })
}

type Props = { searchParams: { child?: string } }

export default async function ParentHomeworkPage({ searchParams }: Props) {
  const { supabase, schoolId, parent } = await requireParentCtx()

  // Linked children.
  const { data: links } = await supabase
    .from('parent_student_links')
    .select('students!student_id(id, first_name, last_name)')
    .eq('parent_id', parent.id).eq('school_id', schoolId)
  type Child = { id: string; first_name: string; last_name: string }
  const children = ((links ?? []) as unknown as { students: Child | null }[]).map((l) => l.students).filter((c): c is Child => !!c)

  if (children.length === 0) {
    return (
      <Shell>
        <Empty title="Aucun enfant rattaché" subtitle="Contactez l'administration de l'école pour lier votre compte à votre enfant." />
      </Shell>
    )
  }

  // Active year + each child's current class.
  const { data: yr } = await supabase.from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle()
  const yearId = (yr as { id: string } | null)?.id

  const childIds = children.map((c) => c.id)
  const classByChild = new Map<string, { classId: string; className: string }>()
  const classToChildren = new Map<string, string[]>()
  if (yearId) {
    const { data: enr } = await supabase
      .from('student_class_enrollments')
      .select('student_id, class_id, classes!class_id(name, section)')
      .eq('school_id', schoolId).eq('academic_year_id', yearId).eq('status', 'active').in('student_id', childIds)
    for (const e of (enr ?? []) as unknown as { student_id: string; class_id: string; classes: { name: string; section: string | null } | null }[]) {
      const cls = one<{ name: string; section: string | null }>(e.classes as never)
      const className = [cls?.name, cls?.section].filter(Boolean).join(' ') || '—'
      classByChild.set(e.student_id, { classId: e.class_id, className })
      const list = classToChildren.get(e.class_id) ?? []; list.push(e.student_id); classToChildren.set(e.class_id, list)
    }
  }

  const selectedChild = searchParams.child && childIds.includes(searchParams.child) ? searchParams.child : ''
  const visibleClassIds = Array.from(new Set(
    (selectedChild ? [selectedChild] : childIds).map((cid) => classByChild.get(cid)?.classId).filter((x): x is string => !!x),
  ))

  const today = new Date().toISOString().slice(0, 10)
  type HwRow = { id: string; title: string; description: string | null; due_date: string | null; class_id: string; subjectName: string }
  let homework: HwRow[] = []
  if (visibleClassIds.length > 0) {
    const { data } = await supabase
      .from('homework')
      .select('id, title, description, due_date, class_id, class_subjects!class_subject_id(subjects!subject_id(name))')
      .eq('school_id', schoolId).in('class_id', visibleClassIds)
      .order('due_date', { ascending: true, nullsFirst: false })
    homework = ((data ?? []) as unknown as { id: string; title: string; description: string | null; due_date: string | null; class_id: string; class_subjects: unknown }[]).map((r) => {
      const cs = one<{ subjects: unknown }>(r.class_subjects as never)
      const subj = one<{ name: string }>(cs?.subjects as never)
      return { id: r.id, title: r.title, description: r.description, due_date: r.due_date, class_id: r.class_id, subjectName: subj?.name ?? '—' }
    })
  }

  const nameById = new Map(children.map((c) => [c.id, `${c.first_name}`]))
  const childChips = (classId: string) =>
    (classToChildren.get(classId) ?? []).map((cid) => nameById.get(cid)).filter(Boolean) as string[]

  const upcoming = homework.filter((h) => !h.due_date || h.due_date >= today)
  const past = homework.filter((h) => h.due_date && h.due_date < today).reverse()

  const Card = (h: HwRow) => (
    <div key={h.id} className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{h.title}</p>
          <p className="text-xs text-gray-400">{h.subjectName}
            {childChips(h.class_id).length > 1 && <span> · {childChips(h.class_id).join(', ')}</span>}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-sand-200 bg-sand-50 px-2.5 py-0.5 text-xs font-medium text-gray-600">{fmtDate(h.due_date)}</span>
      </div>
      {h.description && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{h.description}</p>}
    </div>
  )

  return (
    <Shell>
      {children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <a href="/parent/homework" className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${!selectedChild ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'}`}>Tous</a>
          {children.map((c) => (
            <a key={c.id} href={`/parent/homework?child=${c.id}`} className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${selectedChild === c.id ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'}`}>{c.first_name}</a>
          ))}
        </div>
      )}

      {homework.length === 0 ? (
        <Empty title="Aucun devoir" subtitle="Les devoirs publiés par les enseignants apparaîtront ici." />
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
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Devoirs</h1>
        <p className="text-sm text-gray-500">Les devoirs donnés à vos enfants.</p>
      </div>
      {children}
    </div>
  )
}

function Empty({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-14 text-center">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
    </div>
  )
}
