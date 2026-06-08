import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { EditSubjectForm } from './_form'
import { deleteSubject } from '../../../actions'

const DELETE_ERRORS: Record<string, string> = {
  inuse:    "Cette matière est assignée à une ou plusieurs classes et ne peut pas être supprimée. Retirez-la d'abord de ces classes.",
  readonly: 'Cet établissement est en lecture seule. Les modifications sont désactivées.',
  delete:   'Erreur lors de la suppression. Veuillez réessayer.',
}

type Props = { params: { subjectId: string }; searchParams: { error?: string } }

export default async function EditSubjectPage({ params, searchParams }: Props) {
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

  const { data: subjectData } = await supabase
    .from('subjects')
    .select('id, name, code, coefficient')
    .eq('id', params.subjectId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!subjectData) notFound()

  type Subject = { id: string; name: string; code: string | null; coefficient: number | null }
  const subject = subjectData as Subject

  const errorMessage = searchParams.error ? (DELETE_ERRORS[searchParams.error] ?? '') : ''

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/academics/subjects" className="text-primary-300 hover:text-white text-sm">
            ← Matières
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Modifier la matière</h1>
        <p className="text-primary-300 text-sm mt-0.5">{subject.name}</p>
      </div>

      {errorMessage && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* ── Form card ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <EditSubjectForm subject={subject} />
      </div>

      {/* ── Danger zone : delete ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-red-200 bg-red-50/50 px-6 py-5">
        <h2 className="text-sm font-semibold text-red-800">Supprimer la matière</h2>
        <p className="mt-1 text-xs text-gray-500">
          Suppression possible uniquement si la matière n&apos;est assignée à aucune classe.
        </p>
        <form action={deleteSubject} className="mt-3">
          <input type="hidden" name="subject_id" value={subject.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition-colors hover:bg-red-600 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
          >
            Supprimer cette matière
          </button>
        </form>
      </div>

    </div>
  )
}
