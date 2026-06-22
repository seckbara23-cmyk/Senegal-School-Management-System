import { requireParentCtx } from '../../_auth'
import { NewMessageForm } from './_form'

export const dynamic = 'force-dynamic'

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default async function NewParentMessagePage() {
  const { supabase, schoolId, parent } = await requireParentCtx()

  const { data: links } = await supabase
    .from('parent_student_links').select('students!student_id(id, first_name, last_name)')
    .eq('parent_id', parent.id).eq('school_id', schoolId)
  type Child = { id: string; first_name: string; last_name: string }
  const children = ((links ?? []) as unknown as { students: Child | null }[]).map((l) => l.students).filter((c): c is Child => !!c)
  const childName = new Map(children.map((c) => [c.id, `${c.first_name} ${c.last_name}`]))

  let options: { value: string; label: string }[] = []
  if (children.length > 0) {
    const { data: yr } = await supabase.from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle()
    const yearId = (yr as { id: string } | null)?.id

    if (yearId) {
      const { data: enr } = await supabase
        .from('student_class_enrollments').select('student_id, class_id')
        .eq('school_id', schoolId).eq('academic_year_id', yearId).eq('status', 'active').in('student_id', children.map((c) => c.id))
      const classByChild = new Map<string, string>()
      for (const e of (enr ?? []) as { student_id: string; class_id: string }[]) classByChild.set(e.student_id, e.class_id)
      const classIds = Array.from(new Set(Array.from(classByChild.values())))

      if (classIds.length > 0) {
        const { data: cs } = await supabase
          .from('class_subjects').select('id, class_id, subjects!subject_id(name)').eq('school_id', schoolId).in('class_id', classIds)
        type Cs = { id: string; class_id: string; subjects: unknown }
        const csInfo = new Map<string, { classId: string; subject: string }>()
        for (const c of (cs ?? []) as Cs[]) csInfo.set(c.id, { classId: c.class_id, subject: one<{ name: string }>(c.subjects as never)?.name ?? '—' })

        const { data: tsa } = await supabase
          .from('teacher_subject_assignments').select('class_subject_id, teachers!teacher_id(id, first_name, last_name)')
          .eq('school_id', schoolId).in('class_subject_id', Array.from(csInfo.keys()))
        type Tsa = { class_subject_id: string; teachers: unknown }
        const teacherByCs = new Map<string, { id: string; name: string }>()
        for (const a of (tsa ?? []) as Tsa[]) {
          const t = one<{ id: string; first_name: string; last_name: string }>(a.teachers as never)
          if (t) teacherByCs.set(a.class_subject_id, { id: t.id, name: `${t.first_name} ${t.last_name}` })
        }

        // Build one option per (child, teacher), accumulating subject names.
        const acc = new Map<string, { childId: string; teacherId: string; teacherName: string; subjects: Set<string> }>()
        for (const child of children) {
          const classId = classByChild.get(child.id)
          if (!classId) continue
          csInfo.forEach((info, csId) => {
            if (info.classId !== classId) return
            const teacher = teacherByCs.get(csId)
            if (!teacher) return
            const key = `${child.id}|${teacher.id}`
            const entry = acc.get(key) ?? { childId: child.id, teacherId: teacher.id, teacherName: teacher.name, subjects: new Set<string>() }
            entry.subjects.add(info.subject)
            acc.set(key, entry)
          })
        }
        options = Array.from(acc.entries()).map(([key, e]) => ({
          value: key,
          label: `${childName.get(e.childId) ?? '—'} → ${e.teacherName} (${Array.from(e.subjects).join(', ')})`,
        })).sort((a, b) => a.label.localeCompare(b.label))
      }
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 pb-8">
      <div>
        <a href="/parent/messages" className="text-sm text-primary-600 hover:underline">← Messages</a>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">Nouveau message</h1>
      </div>

      {options.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-12 text-center">
          <p className="text-sm font-medium text-gray-900">Aucun enseignant disponible</p>
          <p className="mt-1 text-sm text-gray-500">Les enseignants apparaîtront une fois vos enfants inscrits dans une classe avec des matières attribuées.</p>
        </div>
      ) : (
        <NewMessageForm options={options} />
      )}
    </div>
  )
}
