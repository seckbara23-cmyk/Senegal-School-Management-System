import { notFound } from 'next/navigation'
import { requireParentCtx } from '../../_auth'
import { loadStudentSnapshot } from '@/lib/copilot/student-snapshot'
import { generateStudentNarrative } from '@/lib/copilot/student-narrative'
import { StudentNarrativeCard } from '@/components/StudentNarrativeCard'

export const dynamic = 'force-dynamic'

export default async function ParentChildSynthesisPage({ params }: { params: { studentId: string } }) {
  const { supabase, schoolId, parent } = await requireParentCtx()

  // The student must be one of the parent's linked children.
  const { data: links } = await supabase.from('parent_student_links').select('student_id').eq('parent_id', parent.id)
  const childIds = ((links ?? []) as { student_id: string }[]).map((l) => l.student_id)
  if (!childIds.includes(params.studentId)) notFound()

  const { data: studentRes } = await supabase
    .from('students').select('first_name, last_name').eq('id', params.studentId).eq('school_id', schoolId).maybeSingle()
  if (!studentRes) notFound()
  const student = studentRes as { first_name: string; last_name: string }

  // Reuses the Context Builder snapshot loader (under the parent's RLS) + the
  // shared deterministic narrative engine — identical to the school view.
  const snapshot = await loadStudentSnapshot(supabase, schoolId, params.studentId, { firstName: student.first_name, lastName: student.last_name })
  const narrative = generateStudentNarrative(snapshot!)

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      <div>
        <a href="/parent" className="text-sm text-primary-600 hover:text-primary-800 hover:underline">← Tableau de bord</a>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{student.last_name} {student.first_name}</h1>
        <p className="text-sm text-gray-500">Synthèse de suivi · lecture seule, calculée à partir des données de l’école.</p>
      </div>

      <StudentNarrativeCard narrative={narrative} />

      <div className="flex flex-wrap gap-2">
        <a href={`/parent/bulletins?child=${params.studentId}`} className="rounded-md bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100">Bulletins</a>
        <a href={`/parent/attendance?child=${params.studentId}`} className="rounded-md bg-sand-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-sand-200">Présences</a>
        <a href={`/parent/finance?child=${params.studentId}`} className="rounded-md bg-sand-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-sand-200">Finance</a>
      </div>
    </div>
  )
}
