import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { transferStudent } from '../../../classes/actions'

const ERRORS: Record<string, string> = {
  readonly: 'Cet établissement est en lecture seule. Les modifications sont désactivées.',
  invalid:  'Classe cible invalide.',
  already:  'Cet élève est déjà inscrit dans cette classe.',
  server:   'Erreur lors du transfert. Veuillez réessayer.',
}

type Props = { params: { studentId: string }; searchParams: { error?: string } }

export default async function TransferStudentPage({ params, searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: studentData } = await supabase
    .from('students').select('id, first_name, last_name, admission_number')
    .eq('id', params.studentId).eq('school_id', schoolId).maybeSingle()
  if (!studentData) notFound()
  const student = studentData as { id: string; first_name: string; last_name: string; admission_number: string }
  const fullName = `${student.last_name} ${student.first_name}`

  // Current active enrollment (drives the academic year of the transfer).
  type EnrRow = {
    class_id: string
    academic_year_id: string
    classes: { name: string; section: string | null } | null
    academic_years: { name: string } | null
  }
  const { data: enrData } = await supabase
    .from('student_class_enrollments')
    .select('class_id, academic_year_id, classes!class_id(name, section), academic_years!academic_year_id(name)')
    .eq('school_id', schoolId).eq('student_id', student.id).eq('status', 'active')
    .order('enrolled_at', { ascending: false })
  const activeEnrollments = (enrData ?? []) as unknown as EnrRow[]
  const current = activeEnrollments[0] ?? null

  const errorMsg = searchParams.error ? (ERRORS[searchParams.error] ?? '') : ''

  // Candidate target classes: same academic year as the current enrollment,
  // excluding the classes the student is already actively in.
  type ClassRow = { id: string; name: string; section: string | null }
  let targets: ClassRow[] = []
  if (current) {
    const activeClassIds = new Set(activeEnrollments.map((e) => e.class_id))
    const { data: clsData } = await supabase
      .from('classes').select('id, name, section')
      .eq('school_id', schoolId).eq('academic_year_id', current.academic_year_id).order('name')
    targets = ((clsData ?? []) as ClassRow[]).filter((c) => !activeClassIds.has(c.id))
  }

  const label = (c: { name: string; section: string | null }) => [c.name, c.section].filter(Boolean).join(' ')

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href={`/school/students/${student.id}`} className="text-primary-300 hover:text-white text-sm">← {fullName}</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Transférer l&apos;élève</h1>
        <p className="text-primary-300 text-sm mt-0.5 font-mono">{student.admission_number}</p>
      </div>

      {errorMsg && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{errorMsg}</p>
        </div>
      )}

      {!current ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune inscription active</p>
          <p className="mt-1 text-sm text-gray-400">Cet élève n&apos;est inscrit dans aucune classe active. Inscrivez-le d&apos;abord depuis une classe.</p>
          <a href="/school/classes" className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors">Voir les classes</a>
        </div>
      ) : targets.length === 0 ? (
        <div className="rounded-xl border border-sand-200 bg-white px-5 py-5 shadow-sm">
          <p className="text-sm text-gray-600">
            Classe actuelle : <span className="font-semibold">{current.classes ? label(current.classes) : '—'}</span>
            {' '}({current.academic_years?.name ?? ''})
          </p>
          <p className="mt-2 text-sm text-gray-400">Aucune autre classe disponible dans cette année scolaire.</p>
        </div>
      ) : (
        <div className="max-w-xl rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
          <p className="mb-4 text-sm text-gray-600">
            Classe actuelle : <span className="font-semibold text-gray-900">{current.classes ? label(current.classes) : '—'}</span>
            {' '}<span className="text-gray-400">({current.academic_years?.name ?? ''})</span>
          </p>
          <form action={transferStudent} className="space-y-4">
            <input type="hidden" name="student_id" value={student.id} />
            <div>
              <label htmlFor="target_class_id" className="block text-sm font-medium text-gray-700">Nouvelle classe</label>
              <select
                id="target_class_id"
                name="target_class_id"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
              >
                {targets.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
              </select>
              <p className="mt-1 text-xs text-gray-400">L&apos;inscription actuelle sera marquée « transférée ».</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
              <button type="submit" className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 transition-colors">
                Transférer
              </button>
              <a href={`/school/students/${student.id}`} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</a>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
