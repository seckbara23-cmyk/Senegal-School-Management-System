import { requireTeacherCtx } from '../../_auth'
import { NewTeacherMessageForm } from './_form'

export const dynamic = 'force-dynamic'

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default async function NewTeacherMessagePage() {
  const { supabase, schoolId, assignedClassSubjectIds } = await requireTeacherCtx()

  let options: { value: string; label: string }[] = []
  if (assignedClassSubjectIds.length > 0) {
    // Classes the teacher is assigned to.
    const { data: cs } = await supabase.from('class_subjects').select('class_id').eq('school_id', schoolId).in('id', assignedClassSubjectIds)
    const classIds = Array.from(new Set(((cs ?? []) as { class_id: string }[]).map((c) => c.class_id)))

    if (classIds.length > 0) {
      const { data: yr } = await supabase.from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle()
      const yearId = (yr as { id: string } | null)?.id

      let enrQ = supabase
        .from('student_class_enrollments').select('student_id, students!student_id(first_name, last_name)')
        .eq('school_id', schoolId).eq('status', 'active').in('class_id', classIds)
      if (yearId) enrQ = enrQ.eq('academic_year_id', yearId)
      const { data: enr } = await enrQ
      type Enr = { student_id: string; students: unknown }
      const studentName = new Map<string, string>()
      for (const e of (enr ?? []) as Enr[]) {
        const s = one<{ first_name: string; last_name: string }>(e.students as never)
        if (s) studentName.set(e.student_id, `${s.first_name} ${s.last_name}`)
      }
      const studentIds = Array.from(studentName.keys())

      if (studentIds.length > 0) {
        const { data: links } = await supabase
          .from('parent_student_links').select('student_id, parents!parent_id(id, first_name, last_name)')
          .eq('school_id', schoolId).in('student_id', studentIds)
        type Link = { student_id: string; parents: unknown }
        for (const l of (links ?? []) as Link[]) {
          const p = one<{ id: string; first_name: string; last_name: string }>(l.parents as never)
          if (!p) continue
          options.push({ value: `${l.student_id}|${p.id}`, label: `${studentName.get(l.student_id) ?? '—'} — parent : ${p.first_name} ${p.last_name}` })
        }
        options.sort((a, b) => a.label.localeCompare(b.label))
      }
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 pb-8">
      <div>
        <a href="/teacher/messages" className="text-sm text-primary-600 hover:underline">← Messages</a>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">Nouveau message</h1>
      </div>

      {options.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-12 text-center">
          <p className="text-sm font-medium text-gray-900">Aucun parent disponible</p>
          <p className="mt-1 text-sm text-gray-500">Les parents apparaîtront une fois vos élèves rattachés à un compte parent.</p>
        </div>
      ) : (
        <NewTeacherMessageForm options={options} />
      )}
    </div>
  )
}
