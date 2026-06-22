import { requireTeacherCtx } from '../../_auth'
import { NewHomeworkForm } from './_form'

export const dynamic = 'force-dynamic'

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default async function NewHomeworkPage() {
  const { supabase, schoolId, assignedClassSubjectIds } = await requireTeacherCtx()

  let options: { id: string; label: string }[] = []
  if (assignedClassSubjectIds.length > 0) {
    const { data } = await supabase
      .from('class_subjects')
      .select('id, classes!class_id(name, section), subjects!subject_id(name)')
      .eq('school_id', schoolId).in('id', assignedClassSubjectIds)

    type Row = { id: string; classes: unknown; subjects: unknown }
    options = ((data ?? []) as Row[]).map((r) => {
      const cls = one<{ name: string; section: string | null }>(r.classes as never)
      const subj = one<{ name: string }>(r.subjects as never)
      return { id: r.id, label: `${subj?.name ?? '—'} — ${[cls?.name, cls?.section].filter(Boolean).join(' ') || '—'}` }
    }).sort((a, b) => a.label.localeCompare(b.label))
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 pb-8">
      <div>
        <a href="/teacher/homework" className="text-sm text-primary-600 hover:underline">← Devoirs</a>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">Nouveau devoir</h1>
      </div>

      {options.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-12 text-center">
          <p className="text-sm font-medium text-gray-900">Aucune matière assignée</p>
          <p className="mt-1 text-sm text-gray-500">Vous devez être assigné à une matière pour publier un devoir.</p>
        </div>
      ) : (
        <NewHomeworkForm options={options} />
      )}
    </div>
  )
}
