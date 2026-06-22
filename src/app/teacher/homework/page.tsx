import { requireTeacherCtx } from '../_auth'
import { deleteHomework } from './actions'

export const dynamic = 'force-dynamic'

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'Sans échéance'
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
}

type Props = { searchParams: { created?: string; deleted?: string; error?: string } }

export default async function TeacherHomeworkPage({ searchParams }: Props) {
  const { supabase, schoolId, assignedClassSubjectIds } = await requireTeacherCtx()

  const today = new Date().toISOString().slice(0, 10)
  let rows: { id: string; title: string; description: string | null; due_date: string | null; className: string; subjectName: string }[] = []

  if (assignedClassSubjectIds.length > 0) {
    const { data } = await supabase
      .from('homework')
      .select('id, title, description, due_date, class_subjects!class_subject_id(classes!class_id(name, section), subjects!subject_id(name))')
      .eq('school_id', schoolId).in('class_subject_id', assignedClassSubjectIds)
      .order('due_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })

    type Row = { id: string; title: string; description: string | null; due_date: string | null; class_subjects: unknown }
    rows = ((data ?? []) as Row[]).map((r) => {
      const cs = one<{ classes: unknown; subjects: unknown }>(r.class_subjects as never)
      const cls = one<{ name: string; section: string | null }>(cs?.classes as never)
      const subj = one<{ name: string }>(cs?.subjects as never)
      return {
        id: r.id, title: r.title, description: r.description, due_date: r.due_date,
        className: [cls?.name, cls?.section].filter(Boolean).join(' ') || '—',
        subjectName: subj?.name ?? '—',
      }
    })
  }

  const upcoming = rows.filter((r) => !r.due_date || r.due_date >= today)
  const past = rows.filter((r) => r.due_date && r.due_date < today)

  const banner = searchParams.created ? { ok: true, msg: 'Devoir publié. Les élèves et parents ont été notifiés.' }
    : searchParams.deleted ? { ok: true, msg: 'Devoir supprimé.' }
    : searchParams.error ? { ok: false, msg: searchParams.error === 'locked' ? 'École en lecture seule.' : 'Une erreur est survenue.' }
    : null

  const Card = (r: typeof rows[number]) => (
    <div key={r.id} className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{r.title}</p>
          <p className="text-xs text-gray-400">{r.subjectName} · {r.className}</p>
        </div>
        <span className="shrink-0 rounded-full border border-sand-200 bg-sand-50 px-2.5 py-0.5 text-xs font-medium text-gray-600">{fmtDate(r.due_date)}</span>
      </div>
      {r.description && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{r.description}</p>}
      <form action={deleteHomework} className="mt-3">
        <input type="hidden" name="id" value={r.id} />
        <button type="submit" className="text-xs font-medium text-red-600 hover:underline">Supprimer</button>
      </form>
    </div>
  )

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Devoirs</h1>
          <p className="text-sm text-gray-500">Publiez les devoirs de vos matières — visibles par les élèves et leurs parents.</p>
        </div>
        <a href="/teacher/homework/new" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700">+ Nouveau devoir</a>
      </div>

      {banner && (
        <div role="alert" className={`rounded-lg border p-3 text-sm ${banner.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{banner.msg}</div>
      )}

      {assignedClassSubjectIds.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-14 text-center">
          <p className="text-sm font-medium text-gray-900">Aucune matière assignée</p>
          <p className="mt-1 text-sm text-gray-500">Vous pourrez publier des devoirs une fois vos matières attribuées.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-14 text-center">
          <p className="text-sm font-medium text-gray-900">Aucun devoir pour le moment</p>
          <p className="mt-1 text-sm text-gray-500">Cliquez sur « Nouveau devoir » pour en publier un.</p>
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
