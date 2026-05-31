import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  ACTION_GROUPS,
  RESOURCE_TYPES,
  actionLabel,
  actionTone,
  resourceTypeLabel,
  TONE_BADGE,
} from '@/lib/audit-labels'

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

const PAGE_SIZES = [25, 50] as const
const DEFAULT_PAGE_SIZE = 25
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day:    'numeric',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  })
}

function getParam(
  searchParams: { [key: string]: string | string[] | undefined },
  key: string
): string {
  const val = searchParams[key]
  return (Array.isArray(val) ? val[0] : val) ?? ''
}

// Builds a viewer URL preserving the base filter params, with overrides on top.
function buildPageUrl(base: Record<string, string>, overrides: Record<string, string>): string {
  const params = new URLSearchParams({ ...base, ...overrides })
  return `/super-admin/audit-logs?${params.toString()}`
}

// One-line preview of a metadata object for the collapsed row.
function metadataPreview(metadata: Record<string, unknown> | null): string {
  if (!metadata) return ''
  const parts: string[] = []
  for (const [k, v] of Object.entries(metadata)) {
    if (v === null || v === undefined || v === '') continue
    const val = Array.isArray(v) ? `${v.length} élément(s)` : typeof v === 'object' ? '{…}' : String(v)
    parts.push(`${k}: ${val}`)
    if (parts.length >= 4) break
  }
  return parts.join(' · ')
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

  // ── Parse & sanitise URL search params ───────────────────────────────────────
  const q            = getParam(searchParams, 'q').trim().slice(0, 100)
  const actionFilter = getParam(searchParams, 'action').trim().slice(0, 60)
  const rtFilter     = getParam(searchParams, 'resource_type').trim().slice(0, 40)
  const schoolFilter = getParam(searchParams, 'school_id').trim()
  const dateFrom     = getParam(searchParams, 'date_from').trim()
  const dateTo       = getParam(searchParams, 'date_to').trim()

  const schoolValid   = UUID_RE.test(schoolFilter)
  const dateFromValid = DATE_RE.test(dateFrom)
  const dateToValid   = DATE_RE.test(dateTo)

  const rawPerPage = parseInt(getParam(searchParams, 'per_page') || String(DEFAULT_PAGE_SIZE), 10)
  const pageSize   = (PAGE_SIZES as readonly number[]).includes(rawPerPage) ? rawPerPage : DEFAULT_PAGE_SIZE
  const page       = Math.max(1, parseInt(getParam(searchParams, 'page') || '1', 10))
  const offset     = (page - 1) * pageSize

  // Filter params without `page` — preserved across pagination links.
  const baseParams: Record<string, string> = {}
  if (q)            baseParams.q             = q
  if (actionFilter) baseParams.action        = actionFilter
  if (rtFilter)     baseParams.resource_type = rtFilter
  if (schoolValid)  baseParams.school_id     = schoolFilter
  if (dateFromValid) baseParams.date_from    = dateFrom
  if (dateToValid)   baseParams.date_to      = dateTo
  if (pageSize !== DEFAULT_PAGE_SIZE) baseParams.per_page = String(pageSize)

  // ── Time boundaries for stats ────────────────────────────────────────────────
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - 7)

  // ── Build filtered logs query (lazy until awaited) ────────────────────────────
  let logsQuery = supabase
    .from('audit_logs')
    .select(
      'id, actor_id, actor_email, action, resource_type, resource_id, school_id, metadata, created_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (actionFilter)  logsQuery = logsQuery.eq('action', actionFilter)
  if (rtFilter)      logsQuery = logsQuery.eq('resource_type', rtFilter)
  if (schoolValid)   logsQuery = logsQuery.eq('school_id', schoolFilter)
  if (q)             logsQuery = logsQuery.ilike('actor_email', `%${q}%`)
  if (dateFromValid) logsQuery = logsQuery.gte('created_at', `${dateFrom}T00:00:00.000Z`)
  if (dateToValid)   logsQuery = logsQuery.lte('created_at', `${dateTo}T23:59:59.999Z`)

  // ── Parallel fetch: stats + schools (for filter + display) + filtered logs ────
  const [totalResult, todayResult, weekResult, schoolsResult, logsResult] = await Promise.all([
    supabase.from('audit_logs').select('id', { count: 'exact', head: true }),
    supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString()),
    supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', weekStart.toISOString()),
    supabase.from('schools').select('id, name').order('name', { ascending: true }),
    logsQuery,
  ])

  const totalLogs = totalResult.count ?? 0
  const todayLogs = todayResult.count ?? 0
  const weekLogs  = weekResult.count  ?? 0

  const schools = (schoolsResult.data ?? []) as { id: string; name: string }[]
  const schoolMap = new Map(schools.map((s) => [s.id, s.name]))

  const logs          = logsResult.data as AuditLog[] | null
  const totalFiltered = logsResult.count ?? 0
  const totalPages    = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const hasError      = !!logsResult.error || !!totalResult.error

  // ── Enrich actors with profile names for the current page ─────────────────────
  const actorIds = Array.from(
    new Set((logs ?? []).map((l) => l.actor_id).filter((v): v is string => !!v))
  )
  const actorNames = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: actorRows } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', actorIds)
    for (const r of (actorRows ?? []) as { id: string; full_name: string | null }[]) {
      if (r.full_name) actorNames.set(r.id, r.full_name)
    }
  }

  const prevUrl = page > 1          ? buildPageUrl(baseParams, { page: String(page - 1) }) : null
  const nextUrl = page < totalPages ? buildPageUrl(baseParams, { page: String(page + 1) }) : null

  const isFiltered = !!(q || actionFilter || rtFilter || schoolValid || dateFromValid || dateToValid)

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
            Console d&apos;exploitation · suivi des actions sur la plateforme · accès super administrateur
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
        <h2 id="stats-heading" className="sr-only">Statistiques des journaux</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total des journaux" value={totalLogs} />
          <StatCard label="Aujourd'hui"        value={todayLogs} />
          <StatCard label="7 derniers jours"   value={weekLogs} />
          <StatCard label="Écoles"             value={schools.length} />
        </div>
      </section>

      {/* ── Filter form ───────────────────────────────────────────────────────── */}
      {/* Pure HTML GET form — works without JavaScript, filters live in the URL. */}
      <section aria-labelledby="filters-heading" className="bg-white shadow rounded-xl p-5">
        <h2 id="filters-heading" className="text-sm font-semibold text-gray-700 mb-4">Filtres</h2>
        <form method="get" action="/super-admin/audit-logs" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Actor email */}
            <div className="flex flex-col gap-1">
              <label htmlFor="q" className="text-xs font-medium text-gray-500">Acteur (email)</label>
              <input
                id="q"
                type="search"
                name="q"
                defaultValue={q}
                placeholder="ex. admin@ecole.sn"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Action */}
            <div className="flex flex-col gap-1">
              <label htmlFor="action" className="text-xs font-medium text-gray-500">Action</label>
              <select
                id="action"
                name="action"
                defaultValue={actionFilter}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Toutes les actions</option>
                {ACTION_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.actions.map((a) => (
                      <option key={a} value={a}>{actionLabel(a)}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Resource type */}
            <div className="flex flex-col gap-1">
              <label htmlFor="resource_type" className="text-xs font-medium text-gray-500">Ressource</label>
              <select
                id="resource_type"
                name="resource_type"
                defaultValue={rtFilter}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Toutes les ressources</option>
                {RESOURCE_TYPES.map((rt) => (
                  <option key={rt} value={rt}>{resourceTypeLabel(rt)}</option>
                ))}
              </select>
            </div>

            {/* School */}
            <div className="flex flex-col gap-1">
              <label htmlFor="school_id" className="text-xs font-medium text-gray-500">École</label>
              <select
                id="school_id"
                name="school_id"
                defaultValue={schoolValid ? schoolFilter : ''}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Toutes les écoles</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Date from */}
            <div className="flex flex-col gap-1">
              <label htmlFor="date_from" className="text-xs font-medium text-gray-500">Du</label>
              <input
                id="date_from"
                type="date"
                name="date_from"
                defaultValue={dateFromValid ? dateFrom : ''}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Date to */}
            <div className="flex flex-col gap-1">
              <label htmlFor="date_to" className="text-xs font-medium text-gray-500">Au</label>
              <input
                id="date_to"
                type="date"
                name="date_to"
                defaultValue={dateToValid ? dateTo : ''}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            {/* Per-page selector */}
            <div className="flex flex-col gap-1">
              <label htmlFor="per_page" className="text-xs font-medium text-gray-500">Par page</label>
              <select
                id="per_page"
                name="per_page"
                defaultValue={String(pageSize)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

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
          </div>
        </form>
      </section>

      {/* ── Logs list ─────────────────────────────────────────────────────────── */}
      <section aria-labelledby="logs-heading">
        <div className="flex items-center justify-between mb-3">
          <h2 id="logs-heading" className="text-sm font-semibold text-gray-500 uppercase tracking-widest">
            {isFiltered ? `Résultats filtrés (${totalFiltered})` : `Journaux (${totalFiltered})`}
          </h2>
          {totalPages > 1 && (
            <span className="text-xs text-gray-400">Page {page} / {totalPages}</span>
          )}
        </div>

        {/* Empty state */}
        {!hasError && (!logs || logs.length === 0) && (
          <div className="bg-white shadow rounded-xl p-10 text-center">
            <p className="text-gray-500 text-sm font-medium">Aucun journal d&apos;audit trouvé.</p>
            <p className="mt-2 text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
              {isFiltered
                ? 'Essayez de modifier ou réinitialiser les filtres.'
                : "Les journaux s'afficheront ici dès que des actions seront enregistrées."}
            </p>
          </div>
        )}

        {/* Log cards — stacked, mobile-first */}
        {!hasError && logs && logs.length > 0 && (
          <div className="space-y-3">
            {logs.map((log) => {
              const tone       = actionTone(log.action)
              const badgeClass = TONE_BADGE[tone]
              const badgeLabel = actionLabel(log.action)
              const schoolName = log.school_id ? (schoolMap.get(log.school_id) ?? null) : null
              const actorName  = log.actor_id ? (actorNames.get(log.actor_id) ?? null) : null
              const preview    = metadataPreview(log.metadata)

              return (
                <article key={log.id} className="bg-white shadow rounded-xl overflow-hidden">
                  <div className={`h-1 ${tone === 'delete' ? 'bg-red-500' : tone === 'update' ? 'bg-blue-500' : tone === 'create' ? 'bg-emerald-500' : 'bg-gray-300'}`} />

                  <div className="p-4 sm:p-5">
                    {/* Row 1: timestamp + action badge */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <time dateTime={log.created_at} className="text-xs font-mono text-gray-400">
                        {formatTimestamp(log.created_at)}
                      </time>
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeClass}`}>
                        {badgeLabel}
                      </span>
                    </div>

                    {/* Row 2: actor + school */}
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="text-sm font-medium text-gray-900">
                        {actorName ?? log.actor_email ?? 'Système'}
                      </p>
                      {actorName && log.actor_email && (
                        <span className="text-xs text-gray-400">{log.actor_email}</span>
                      )}
                      {schoolName && (
                        <span className="inline-flex items-center text-xs text-gray-500">
                          <span className="mx-1 text-gray-300">·</span>
                          🏫 {schoolName}
                        </span>
                      )}
                    </div>

                    {/* Row 3: resource type + id */}
                    {(log.resource_type || log.resource_id) && (
                      <p className="mt-1 text-xs text-gray-500 truncate">
                        {log.resource_type && (
                          <span className="font-medium">{resourceTypeLabel(log.resource_type)}</span>
                        )}
                        {log.resource_id && (
                          <span className="font-mono ml-1.5 text-gray-400">#{log.resource_id}</span>
                        )}
                      </p>
                    )}

                    {/* Row 4: metadata — collapsible via native <details> (no JS) */}
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <details className="mt-3 group">
                        <summary className="text-xs text-indigo-600 cursor-pointer select-none hover:text-indigo-800 list-none flex items-center gap-1">
                          <span className="group-open:hidden">▶</span>
                          <span className="hidden group-open:inline">▼</span>
                          <span className="group-open:hidden text-gray-400 font-normal truncate max-w-[60vw] sm:max-w-md">
                            {preview || 'Métadonnées'}
                          </span>
                          <span className="hidden group-open:inline">Métadonnées</span>
                        </summary>
                        <pre className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-x-auto max-h-72 leading-relaxed whitespace-pre-wrap break-words">
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
        <nav aria-label="Pagination des journaux" className="flex items-center justify-between pt-2">
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
