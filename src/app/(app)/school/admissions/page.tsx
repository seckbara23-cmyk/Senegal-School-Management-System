import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const STATUS_LABEL: Record<string, string> = {
  draft:      'Brouillon',
  submitted:  'Soumise',
  accepted:   'Acceptée',
  rejected:   'Refusée',
  waitlisted: "Liste d'attente",
}

const STATUS_CLASS: Record<string, string> = {
  draft:      'border-gray-200 bg-gray-100 text-gray-600',
  submitted:  'border-sky-200 bg-sky-50 text-sky-700',
  accepted:   'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected:   'border-red-200 bg-red-50 text-red-700',
  waitlisted: 'border-amber-200 bg-amber-50 text-amber-700',
}

const FILTERS = ['draft', 'submitted', 'accepted', 'rejected', 'waitlisted'] as const

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-SN', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Row = {
  id: string
  first_name: string
  last_name: string
  status: string
  guardian_name: string | null
  created_at: string
  converted_student_id: string | null
  classes: { name: string; section: string | null } | null
}

type Props = { searchParams: { status?: string } }

export default async function AdmissionsPage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id, schools!school_id(name)')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()
  if (!membership) redirect('/school')
  const schoolId   = (membership as { school_id: string }).school_id
  const schoolName = ((membership as unknown as { schools: { name: string } | null }).schools)?.name ?? ''

  const { data } = await supabase
    .from('admission_applications')
    .select('id, first_name, last_name, status, guardian_name, created_at, converted_student_id, classes!desired_class_id(name, section)')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(300)

  const all = (data ?? []) as unknown as Row[]

  const counts: Record<string, number> = { draft: 0, submitted: 0, accepted: 0, rejected: 0, waitlisted: 0 }
  for (const a of all) counts[a.status] = (counts[a.status] ?? 0) + 1

  const activeFilter = (FILTERS as readonly string[]).includes(searchParams.status ?? '') ? searchParams.status! : null
  const rows = activeFilter ? all.filter((a) => a.status === activeFilter) : all

  return (
    <div className="space-y-5 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Admissions</h1>
            <p className="text-primary-300 text-sm mt-0.5">{schoolName} · {all.length} candidature{all.length !== 1 ? 's' : ''}</p>
          </div>
          <a
            href="/school/admissions/new"
            className="shrink-0 rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 transition-colors shadow-sm"
          >
            + Nouvelle candidature
          </a>
        </div>
      </div>

      {/* ── Status filter chips ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <a
          href="/school/admissions"
          className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${!activeFilter ? 'bg-primary-700 text-white shadow-sm' : 'bg-white border border-sand-200 text-gray-700 hover:bg-sand-100'}`}
        >
          Toutes
        </a>
        {FILTERS.map((f) => (
          <a
            key={f}
            href={`/school/admissions?status=${f}`}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${activeFilter === f ? 'bg-primary-700 text-white shadow-sm' : 'bg-white border border-sand-200 text-gray-700 hover:bg-sand-100'}`}
          >
            {STATUS_LABEL[f]} <span className="ml-1 text-xs font-normal opacity-70">{counts[f] ?? 0}</span>
          </a>
        ))}
      </div>

      {/* ── List / empty states ─────────────────────────────────────────────── */}
      {all.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-16 text-center">
          <h3 className="text-base font-semibold text-gray-900">Aucune candidature</h3>
          <p className="mt-1 text-sm text-gray-500">Enregistrez la première candidature d&apos;admission.</p>
          <a href="/school/admissions/new" className="mt-5 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
            + Nouvelle candidature
          </a>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-sand-200 bg-white py-14 text-center">
          <h3 className="text-base font-semibold text-gray-900">Aucun résultat</h3>
          <p className="mt-1 text-sm text-gray-500">Aucune candidature avec ce statut.</p>
          <a href="/school/admissions" className="mt-4 inline-flex text-sm font-medium text-primary-600 hover:underline">Voir toutes</a>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-sand-200">
            <thead>
              <tr className="bg-sand-50 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Candidat</th>
                <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Classe visée</th>
                <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Tuteur</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Statut</th>
                <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Reçue le</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-sand-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <a href={`/school/admissions/${a.id}`} className="text-sm font-semibold text-gray-900 hover:text-primary-600 hover:underline">
                      {a.last_name} {a.first_name}
                    </a>
                    {a.converted_student_id && (
                      <span className="ml-2 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Élève</span>
                    )}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3.5 text-sm text-gray-600">
                    {a.classes ? [a.classes.name, a.classes.section].filter(Boolean).join(' ') : '—'}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3.5 text-sm text-gray-500">{a.guardian_name ?? '—'}</td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[a.status] ?? STATUS_CLASS.draft}`}>
                      {STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3.5 text-sm text-gray-400 whitespace-nowrap">{fmtDate(a.created_at)}</td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <a href={`/school/admissions/${a.id}`} className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline">Voir →</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

    </div>
  )
}
