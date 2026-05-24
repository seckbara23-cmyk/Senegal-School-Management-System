import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ─── Types ───────────────────────────────────────────────────────────────────

type AuditLog = {
  id: string
  actor_id: string | null
  actor_email: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  school_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25

const ACTION_BADGE: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  login:  'bg-gray-100 text-gray-700',
  logout: 'bg-gray-100 text-gray-700',
}

const ACTION_LABELS: Record<string, string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
  login:  'Connexion',
  logout: 'Déconnexion',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('fr-SN', {
    day:    'numeric',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  })
}

// Builds a /super-admin/audit-logs URL preserving base filter params, with
// the specified overrides applied on top (used to generate pagination links).
function buildPageUrl(base: Record<string, string>, overrides: Record<string, string>): string {
  const params = new URLSearchParams({ ...base, ...overrides })
  return `/super-admin/audit-logs?${params.toString()}`
}

function getParam(
  searchParams: { [key: string]: string | string[] | undefined },
  key: string
): string {
  const val = searchParams[key]
  return (Array.isArray(val) ? val[0] : val) ?? ''
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-4">
      <p className="text-sm text-red-700">{message}</p>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white shadow rounded-xl p-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
      <p className="mt-3 text-3xl font-bold text-indigo-600">{value}</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // ── Super-admin guard ────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('global_role')
    .eq('id', user.id)
    .single()

  if (profile?.global_role !== 'super_admin') redirect('/dashboard')

  // ── Parse URL search params ──────────────────────────────────────────────────
  const q            = getParam(searchParams, 'q').trim().slice(0, 100)
  const actionFilter = getParam(searchParams, 'action')
  const rtFilter     = getParam(searchParams, 'resource_type')
  const page         = Math.max(1, parseInt(getParam(searchParams, 'page') || '1', 10))
  const offset       = (page - 1) * PAGE_SIZE

  // Filter params without page — used to preserve filters in pagination links.
  const baseParams: Record<string, string> = {}
  if (q)            baseParams.q             = q
  if (actionFilter) baseParams.action        = actionFilter
  if (rtFilter)     baseParams.resource_type = rtFilter

  // ── Time boundaries for stats ────────────────────────────────────────────────
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - 7)

  // ── Build filtered logs query ────────────────────────────────────────────────
  // Supabase query builder is lazy — the query is not sent until awaited.
  let logsQuery = supabase
    .from('audit_logs')
    .select(
      'id, actor_id, actor_email, action, resource_type, resource_id, school_id, metadata, created_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (actionFilter) logsQuery = logsQuery.eq('action', actionFilter)
  if (rtFilter)     logsQuery = logsQuery.eq('resource_type', rtFilter)
  if (q)            logsQuery = logsQuery.ilike('actor_email', `%${q}%`)

  // ── Parallel fetch: global stats + filtered logs ─────────────────────────────
  const [totalResult, todayResult, weekResult, actorsResult, logsResult] = await Promise.all([
    // Unfiltered totals for the stats cards
    supabase.from('audit_logs').select('id', { count: 'exact', head: true }),
    supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString()),
    supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', weekStart.toISOString()),
    // Unique actors: fetch up to 500 actor_ids and dedupe in JS.
    // For tables with >500 distinct actors, count is displayed as "500+".
    supabase
      .from('audit_logs')
      .select('actor_id')
      .not('actor_id', 'is', null)
      .limit(500),
    // Filtered + paginated logs
    logsQuery,
  ])

  // ── Derive stat values ───────────────────────────────────────────────────────
  const totalLogs = totalResult.count ?? 0
  const todayLogs = todayResult.count ?? 0
  const weekLogs  = weekResult.count  ?? 0

  const actorsRaw        = (actorsResult.data ?? []) as { actor_id: string }[]
  const uniqueActorCount = new Set(actorsRaw.map((r) => r.actor_id)).size
  const uniqueActorLabel = actorsRaw.length >= 500 ? '500+' : String(uniqueActorCount)

  // ── Logs + pagination ────────────────────────────────────────────────────────
  const logs          = logsResult.data as AuditLog[] | null
  const totalFiltered = logsResult.count ?? 0
  const totalPages    = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE))
  const hasError      = !!logsResult.error || !!totalResult.error

  const prevUrl = page > 1          ? buildPageUrl(baseParams, { page: String(page - 1) }) : null
  const nextUrl = page < totalPages ? buildPageUrl(baseParams, { page: String(page + 1) }) : null

  const isFiltered = !!(q || actionFilter || rtFilter)

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-8">

      {/* ── Page header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <a
            href="/super-admin"
            className="text-sm text-indigo-600 hover:text-indigo-800 inline-block mb-1"
          >
            ← Super Admin Dashboard
          </a>
          <h1 className="text-2xl font-bold text-gray-900">Journaux d&apos;audit</h1>
          <p className="text-gray-500 mt-0.5 text-sm">
            Suivi des actions sur la plateforme · accès réservé aux super administrateurs
          </p>
        </div>
        <span className="self-start shrink-0 inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
          Super Admin
        </span>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────────── */}
      {hasError && (
        <ErrorBanner message="Impossible de charger les journaux d'audit. Veuillez actualiser la page ou contacter l'équipe technique." />
      )}

      {/* ── Stats cards ───────────────────────────────────────────────────────── */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Statistiques des journaux
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total des journaux"   value={totalLogs} />
          <StatCard label="Aujourd'hui"           value={todayLogs} />
          <StatCard label="Cette semaine"         value={weekLogs} />
          <StatCard label="Acteurs distincts"     value={uniqueActorLabel} />
        </div>
      </section>

      {/* ── Filter form ───────────────────────────────────────────────────────── */}
      {/* Pure HTML GET form — works without JavaScript, filters are in the URL. */}
      <section
        aria-labelledby="filters-heading"
        className="bg-white shadow rounded-xl p-5"
      >
        <h2 id="filters-heading" className="text-sm font-semibold text-gray-700 mb-4">
          Filtres
        </h2>
        <form
          method="get"
          action="/super-admin/audit-logs"
          className="flex flex-wrap gap-3 items-end"
        >
          {/* Actor email search */}
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label htmlFor="q" className="text-xs font-medium text-gray-500">
              Email de l&apos;acteur
            </label>
            <input
              id="q"
              type="search"
              name="q"
              defaultValue={q}
              placeholder="ex. admin@ecole.sn"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Action filter */}
          <div className="flex flex-col gap-1">
            <label htmlFor="action" className="text-xs font-medium text-gray-500">
              Action
            </label>
            <select
              id="action"
              name="action"
              defaultValue={actionFilter}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Toutes les actions</option>
              <option value="create">Création</option>
              <option value="update">Modification</option>
              <option value="delete">Suppression</option>
              <option value="login">Connexion</option>
              <option value="logout">Déconnexion</option>
            </select>
          </div>

          {/* Resource type filter */}
          <div className="flex flex-col gap-1">
            <label htmlFor="resource_type" className="text-xs font-medium text-gray-500">
              Ressource
            </label>
            <select
              id="resource_type"
              name="resource_type"
              defaultValue={rtFilter}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Toutes les ressources</option>
              <option value="school">École</option>
              <option value="profile">Profil</option>
              <option value="membership">Appartenance</option>
              <option value="student">Étudiant</option>
              <option value="teacher">Enseignant</option>
              <option value="parent">Parent</option>
            </select>
          </div>

          {/* Submit + reset */}
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Filtrer
            </button>
            {isFiltered && (
              <a
                href="/super-admin/audit-logs"
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Réinitialiser
              </a>
            )}
          </div>
        </form>
      </section>

      {/* ── Logs list ─────────────────────────────────────────────────────────── */}
      <section aria-labelledby="logs-heading">
        <div className="flex items-center justify-between mb-3">
          <h2
            id="logs-heading"
            className="text-sm font-semibold text-gray-500 uppercase tracking-widest"
          >
            {isFiltered
              ? `Résultats filtrés (${totalFiltered})`
              : `Journaux (${totalFiltered})`}
          </h2>
          {totalPages > 1 && (
            <span className="text-xs text-gray-400">
              Page {page} / {totalPages}
            </span>
          )}
        </div>

        {/* Empty state */}
        {!hasError && (!logs || logs.length === 0) && (
          <div className="bg-white shadow rounded-xl p-10 text-center">
            <p className="text-gray-500 text-sm font-medium">
              Aucun journal d&apos;audit trouvé.
            </p>
            <p className="mt-2 text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
              {isFiltered
                ? 'Essayez de modifier ou réinitialiser les filtres.'
                : "Les journaux s'afficheront ici dès que des actions seront enregistrées via les triggers ou l'API."}
            </p>
          </div>
        )}

        {/* Log cards — stacked, mobile-first */}
        {!hasError && logs && logs.length > 0 && (
          <div className="space-y-3">
            {logs.map((log) => {
              const badgeClass = ACTION_BADGE[log.action] ?? 'bg-gray-100 text-gray-700'
              const badgeLabel = ACTION_LABELS[log.action] ?? log.action

              return (
                <article
                  key={log.id}
                  className="bg-white shadow rounded-xl overflow-hidden"
                >
                  {/* Indigo accent bar */}
                  <div className="h-1 bg-indigo-600" />

                  <div className="p-4 sm:p-5">
                    {/* Row 1: timestamp + action badge */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <time
                        dateTime={log.created_at}
                        className="text-xs font-mono text-gray-400"
                      >
                        {formatTimestamp(log.created_at)}
                      </time>
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeClass}`}
                      >
                        {badgeLabel}
                      </span>
                    </div>

                    {/* Row 2: actor */}
                    <p className="mt-2 text-sm font-medium text-gray-900">
                      {log.actor_email ?? 'Système'}
                    </p>

                    {/* Row 3: resource type + id */}
                    {(log.resource_type || log.resource_id) && (
                      <p className="mt-1 text-xs text-gray-500 truncate">
                        {log.resource_type && (
                          <span className="font-medium capitalize">{log.resource_type}</span>
                        )}
                        {log.resource_id && (
                          <span className="font-mono ml-1.5 text-gray-400">
                            #{log.resource_id}
                          </span>
                        )}
                      </p>
                    )}

                    {/* Row 4: metadata — collapsible via native <details> (no JS needed) */}
                    {log.metadata && (
                      <details className="mt-3 group">
                        <summary className="text-xs text-indigo-600 cursor-pointer select-none hover:text-indigo-800 list-none flex items-center gap-1">
                          <span className="group-open:hidden">▶</span>
                          <span className="hidden group-open:inline">▼</span>
                          Métadonnées
                        </summary>
                        <pre className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-x-auto max-h-48 leading-relaxed whitespace-pre-wrap break-words">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Pagination ────────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <nav
          aria-label="Pagination des journaux"
          className="flex items-center justify-between pt-2"
        >
          {prevUrl ? (
            <a
              href={prevUrl}
              className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              ← Précédent
            </a>
          ) : (
            <span className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-300 cursor-not-allowed select-none">
              ← Précédent
            </span>
          )}

          <span className="text-sm text-gray-500">
            Page <strong className="text-gray-900">{page}</strong> /{' '}
            <strong className="text-gray-900">{totalPages}</strong>
          </span>

          {nextUrl ? (
            <a
              href={nextUrl}
              className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Suivant →
            </a>
          ) : (
            <span className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-300 cursor-not-allowed select-none">
              Suivant →
            </span>
          )}
        </nav>
      )}
    </div>
  )
}
