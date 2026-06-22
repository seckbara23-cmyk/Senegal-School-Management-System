import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { promoteClass } from '../../actions'

const ERRORS: Record<string, string> = {
  same:     'La classe cible doit être différente de la classe source.',
  invalid:  'Classe invalide.',
  readonly: 'Cet établissement est en lecture seule. Les modifications sont désactivées.',
  empty:    'Cette classe n\'a aucun élève actif à promouvoir.',
  server:   'Erreur lors de la promotion. Veuillez réessayer.',
}

type Props = { params: { classId: string }; searchParams: { error?: string } }

export default async function PromoteClassPage({ params, searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: srcData } = await supabase
    .from('classes')
    .select('id, name, section, academic_years!academic_year_id(name)')
    .eq('id', params.classId).eq('school_id', schoolId).maybeSingle()
  if (!srcData) notFound()
  type Src = { id: string; name: string; section: string | null; academic_years: { name: string } | null }
  const source = srcData as unknown as Src

  // Active student count of the source class.
  const { count } = await supabase
    .from('student_class_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId).eq('class_id', source.id).eq('status', 'active')
  const activeCount = count ?? 0

  // Target candidates: every other class in the school, most recent year first.
  type ClassRow = { id: string; name: string; section: string | null; academic_years: { name: string; is_active: boolean } | null }
  const { data: clsData } = await supabase
    .from('classes')
    .select('id, name, section, academic_years!academic_year_id(name, is_active, starts_on)')
    .eq('school_id', schoolId)
    .order('name')
  const targets = ((clsData ?? []) as unknown as ClassRow[]).filter((c) => c.id !== source.id)

  const errorMsg = searchParams.error ? (ERRORS[searchParams.error] ?? '') : ''
  const label = (c: { name: string; section: string | null }) => [c.name, c.section].filter(Boolean).join(' ')

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href={`/school/classes/${source.id}`} className="text-primary-300 hover:text-white text-sm">← {label(source)}</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Promouvoir la classe</h1>
        <p className="text-primary-300 text-sm mt-0.5">
          {label(source)}{source.academic_years ? ` · ${source.academic_years.name}` : ''} — {activeCount} élève{activeCount !== 1 ? 's' : ''} actif{activeCount !== 1 ? 's' : ''}
        </p>
      </div>

      {errorMsg && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{errorMsg}</p>
        </div>
      )}

      {activeCount === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun élève actif</p>
          <p className="mt-1 text-sm text-gray-400">Cette classe n&apos;a aucun élève actif à promouvoir.</p>
        </div>
      ) : targets.length === 0 ? (
        <div className="rounded-xl border border-sand-200 bg-white px-5 py-5 shadow-sm text-sm text-gray-500">
          Aucune autre classe disponible. Créez la classe de destination (généralement l&apos;année suivante) puis revenez.
        </div>
      ) : (
        <div className="max-w-xl rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
          <form action={promoteClass} className="space-y-4">
            <input type="hidden" name="source_class_id" value={source.id} />
            <div>
              <label htmlFor="target_class_id" className="block text-sm font-medium text-gray-700">Classe de destination</label>
              <select
                id="target_class_id"
                name="target_class_id"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
              >
                {targets.map((c) => (
                  <option key={c.id} value={c.id}>
                    {label(c)}{c.academic_years ? ` — ${c.academic_years.name}${c.academic_years.is_active ? ' (active)' : ''}` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">
                Les {activeCount} élève{activeCount !== 1 ? 's' : ''} actif{activeCount !== 1 ? 's' : ''} seront inscrit{activeCount !== 1 ? 's' : ''} dans la classe de destination ; leur inscription actuelle sera marquée « transférée ».
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
              <button type="submit" className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 transition-colors">
                Promouvoir {activeCount} élève{activeCount !== 1 ? 's' : ''}
              </button>
              <a href={`/school/classes/${source.id}`} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</a>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
