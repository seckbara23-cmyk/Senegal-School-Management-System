import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

// Billing status (school_subscriptions.status) — distinct from the school
// ACCESS lifecycle (schools.subscription_status).
const SUB_STATUS_LABEL: Record<string, string> = {
  trialing: 'Essai', active: 'Active', past_due: 'Impayé', suspended: 'Suspendu', cancelled: 'Annulé',
}
const SUB_STATUS_BADGE: Record<string, string> = {
  trialing:  'bg-sky-50 text-sky-700 border-sky-200',
  active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  past_due:  'bg-amber-50 text-amber-700 border-amber-200',
  suspended: 'bg-orange-50 text-orange-700 border-orange-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
}
const ACCESS_LABEL: Record<string, string> = {
  active: 'Accès actif', inactive: 'Accès inactif', suspended: 'Accès suspendu', archived: 'Accès archivé',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
function limit(n: number | null): string {
  return n === null || n === undefined ? '∞' : String(n)
}

type SubRow = {
  id: string
  school_id: string
  status: string
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  schools: { name: string; slug: string; subscription_status: string } | null
  subscription_plans: { code: string; name: string; max_students: number | null; max_teachers: number | null } | null
}

type Props = { searchParams: { status?: string; plan?: string; q?: string } }

export default async function SubscriptionsConsolePage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('global_role').eq('id', user.id).maybeSingle()
  if ((profile as { global_role: string } | null)?.global_role !== 'super_admin') redirect('/dashboard')

  // ── Subscriptions (one row per school), joined with school + plan ────────────
  const { data: subsData, error: subsError } = await supabase
    .from('school_subscriptions')
    .select(
      'id, school_id, status, trial_ends_at, current_period_start, current_period_end, ' +
      'schools!inner(name, slug, subscription_status), ' +
      'subscription_plans!inner(code, name, max_students, max_teachers)'
    )

  // Graceful failure when the module isn't initialised (migration 039 missing).
  if (subsError) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-800">Module d&apos;abonnements indisponible</p>
          <p className="mt-1 text-sm text-amber-700">
            Les tables d&apos;abonnement ne sont pas accessibles. Vérifiez que la migration 039
            (<span className="font-mono">039_subscription_foundation.sql</span>) a bien été exécutée dans Supabase.
          </p>
        </div>
      </div>
    )
  }

  const subs = (subsData ?? []) as unknown as SubRow[]

  // ── Active student / teacher counts per school (super-admin sees all) ────────
  const [{ data: studentRows }, { data: teacherRows }] = await Promise.all([
    supabase.from('students').select('school_id').eq('status', 'active'),
    supabase.from('teachers').select('school_id').eq('status', 'active'),
  ])
  const studentCounts = new Map<string, number>()
  for (const r of (studentRows ?? []) as { school_id: string }[]) {
    studentCounts.set(r.school_id, (studentCounts.get(r.school_id) ?? 0) + 1)
  }
  const teacherCounts = new Map<string, number>()
  for (const r of (teacherRows ?? []) as { school_id: string }[]) {
    teacherCounts.set(r.school_id, (teacherCounts.get(r.school_id) ?? 0) + 1)
  }

  // ── Plan catalogue (filter dropdown) ─────────────────────────────────────────
  const { data: plansData } = await supabase
    .from('subscription_plans').select('code, name').order('monthly_price', { ascending: true })
  const plans = (plansData ?? []) as { code: string; name: string }[]

  // ── Filters (applied in JS — one row per school, small set) ──────────────────
  const fStatus = searchParams.status && SUB_STATUS_LABEL[searchParams.status] ? searchParams.status : ''
  const fPlan   = searchParams.plan ?? ''
  const q       = (searchParams.q ?? '').trim().toLowerCase().slice(0, 100)

  let rows = subs
  if (fStatus) rows = rows.filter((r) => r.status === fStatus)
  if (fPlan)   rows = rows.filter((r) => r.subscription_plans?.code === fPlan)
  if (q)       rows = rows.filter((r) => (r.schools?.name ?? '').toLowerCase().includes(q))
  rows = [...rows].sort((a, b) => (a.schools?.name ?? '').localeCompare(b.schools?.name ?? '', 'fr'))

  return (
    <div className="space-y-6">
      <Header />

      {/* Billing vs access note */}
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
        <p className="text-sm text-sky-800">
          <span className="font-semibold">Note :</span> le statut d&apos;abonnement (facturation) est
          indépendant de l&apos;accès de l&apos;école. Annuler ou suspendre un abonnement ne bloque pas
          l&apos;accès — celui-ci se gère via le cycle de vie de l&apos;école (suspendre / archiver).
        </p>
      </div>

      {/* Filters */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
        <div>
          <label htmlFor="status" className="block text-xs font-medium text-gray-600 mb-1">Statut</label>
          <select id="status" name="status" defaultValue={fStatus} className="block rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="">Tous</option>
            {Object.entries(SUB_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="plan" className="block text-xs font-medium text-gray-600 mb-1">Formule</label>
          <select id="plan" name="plan" defaultValue={fPlan} className="block rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="">Toutes</option>
            {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label htmlFor="q" className="block text-xs font-medium text-gray-600 mb-1">Recherche</label>
          <input id="q" name="q" type="search" defaultValue={searchParams.q ?? ''} placeholder="Nom de l'école…" className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Filtrer</button>
          {(fStatus || fPlan || q) && (
            <Link href="/super-admin/subscriptions" className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Réinitialiser</Link>
          )}
        </div>
      </form>

      <p className="text-sm text-gray-500">{rows.length} abonnement{rows.length !== 1 ? 's' : ''}</p>

      {rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun abonnement</p>
          <p className="mt-1 text-sm text-gray-400">Aucun résultat pour ces filtres.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">École</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Formule</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Statut</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Essai</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Fin période</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Élèves</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Enseignants</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const sc = studentCounts.get(r.school_id) ?? 0
                  const tc = teacherCounts.get(r.school_id) ?? 0
                  const maxS = r.subscription_plans?.max_students ?? null
                  const maxT = r.subscription_plans?.max_teachers ?? null
                  const overS = maxS !== null && sc > maxS
                  const overT = maxT !== null && tc > maxT
                  return (
                    <tr key={r.id} className={`border-b border-gray-100 hover:bg-indigo-50/40 ${idx % 2 ? 'bg-gray-50/40' : 'bg-white'}`}>
                      <td className="px-4 py-3">
                        <Link href={`/super-admin/subscriptions/${r.school_id}`} className="font-medium text-gray-900 hover:text-indigo-700 hover:underline">
                          {r.schools?.name ?? '—'}
                        </Link>
                        <p className="text-xs text-gray-400">{ACCESS_LABEL[r.schools?.subscription_status ?? ''] ?? r.schools?.subscription_status}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{r.subscription_plans?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${SUB_STATUS_BADGE[r.status] ?? SUB_STATUS_BADGE.cancelled}`}>
                          {SUB_STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(r.trial_ends_at)}</td>
                      <td className="hidden md:table-cell px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(r.current_period_end)}</td>
                      <td className={`px-4 py-3 text-right whitespace-nowrap ${overS ? 'font-semibold text-red-600' : 'text-gray-700'}`}>
                        {sc} / {limit(maxS)}
                      </td>
                      <td className={`hidden sm:table-cell px-4 py-3 text-right whitespace-nowrap ${overT ? 'font-semibold text-red-600' : 'text-gray-700'}`}>
                        {tc} / {limit(maxT)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/super-admin/subscriptions/${r.school_id}`} className="text-xs font-medium text-indigo-600 hover:text-indigo-900 hover:underline">Gérer →</Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Header() {
  return (
    <div>
      <nav className="mb-1 text-sm text-gray-500">
        <Link href="/super-admin" className="hover:text-indigo-600 hover:underline">Super Admin</Link>
        <span className="mx-2">/</span>
        <span className="font-medium text-gray-900">Abonnements</span>
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Abonnements</h1>
        <Link href="/super-admin/subscriptions/invoices" className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Factures d&apos;abonnement →
        </Link>
      </div>
      <p className="mt-0.5 text-sm text-gray-500">Formules, statuts de facturation et limites par établissement.</p>
    </div>
  )
}
