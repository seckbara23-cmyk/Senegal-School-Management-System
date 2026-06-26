// ─── Dashboard widgets (Phase 11C) ───────────────────────────────────────────
//
// Concrete, presentational widgets composed from <Widget>/<StatCard> primitives.
// Each takes its derived data as props (no data access) so the page can compose,
// and a future phase can hide/reorder/pin them, without touching internals.

import Link from 'next/link'
import { Widget, StatCard, Icon, P, fmtFCFA, relTime, type Tone } from './_widget'
import { ProgressRing } from '@/components/charts'
import { HEALTH_BAND_LABEL, HEALTH_BAND_CLASS, type HealthBand } from '@/lib/platform/health'
import { NOTIFICATION_TYPE_LABEL, type NotificationPreview } from '@/lib/notifications'
import type { AdminDashboard, DashAlert } from '@/lib/dashboard/admin'
import type { PlatformOps } from '@/lib/platform/ops'

// ── Hero ──────────────────────────────────────────────────────────────────────
export function HeroWidget({ firstName, schoolName, roleLabel, roleBadge, isSuperAdmin, today, summaryLine, copilotPath }: {
  firstName: string; schoolName?: string; roleLabel?: string; roleBadge?: string; isSuperAdmin: boolean; today: string; summaryLine?: string; copilotPath?: string | null
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-800 via-primary-800 to-primary-700 px-6 py-7 shadow-sm sm:px-8">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary-600/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 right-24 h-48 w-48 rounded-full bg-accent-500/10 blur-3xl" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          {roleLabel && <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${roleBadge}`}>{roleLabel}</span>}
          {isSuperAdmin && <span className="rounded-full border border-accent-300/40 bg-accent-500/15 px-2.5 py-0.5 text-xs font-semibold text-accent-200">Super Admin</span>}
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Bonjour, {firstName} 👋</h1>
        <p className="mt-1 text-sm text-primary-200">
          {schoolName ? <>Voici l’aperçu de <span className="font-semibold text-white">{schoolName}</span> · <span className="capitalize">{today}</span></> : <>Votre espace ScolaTech · <span className="capitalize">{today}</span></>}
        </p>
        {summaryLine && <p className="mt-1 text-sm text-primary-300">{summaryLine}</p>}
        {copilotPath && (
          <Link href={copilotPath} className="mt-5 flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur transition-colors hover:bg-white/15">
            <Icon d={P.ai} className="h-5 w-5 text-accent-200" />
            <span className="flex-1 text-sm text-primary-100">Demandez à ScolaTech AI — « Comment va l’école ? »</span>
            <Icon d={P.arrow} className="h-4 w-4 text-primary-200" />
          </Link>
        )}
      </div>
    </section>
  )
}

// ── Critical alerts ─────────────────────────────────────────────────────────────
const ALERT_STYLE: Record<DashAlert['tone'], string> = {
  red: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
  amber: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
  sky: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100',
  primary: 'border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
}
export function AlertsWidget({ alerts }: { alerts: DashAlert[] }) {
  if (alerts.length === 0) {
    return <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"><span>🎉</span> Aucune alerte critique aujourd’hui.</div>
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {alerts.map((a) => (
        <a key={a.key} href={a.href} className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm transition-colors ${ALERT_STYLE[a.tone]}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/70"><Icon d={P[a.icon] ?? P.alert} className="h-5 w-5" /></span>
          <span className="min-w-0"><span className="text-lg font-bold leading-none">{a.count}</span> <span className="text-sm font-medium">{a.label}</span></span>
          <Icon d={P.arrow} className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </a>
      ))}
    </div>
  )
}

// ── KPI grid ────────────────────────────────────────────────────────────────────
function entityDelta(newThisWeek: number) { return newThisWeek > 0 ? `+${newThisWeek} cette semaine` : 'stable cette semaine' }
export function KpiGrid({ kpis }: { kpis: AdminDashboard['kpis'] }) {
  const k = kpis
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <StatCard label="Élèves" value={k.students.total} deltaPct={k.students.deltaPct} deltaLabel={entityDelta(k.students.newThisWeek)} spark={k.students.spark} tone="primary" href="/school/students" />
      <StatCard label="Enseignants" value={k.teachers.total} deltaPct={k.teachers.deltaPct} deltaLabel={entityDelta(k.teachers.newThisWeek)} spark={k.teachers.spark} tone="sky" href="/school/teachers" />
      <StatCard label="Parents" value={k.parents.total} deltaPct={k.parents.deltaPct} deltaLabel={entityDelta(k.parents.newThisWeek)} spark={k.parents.spark} tone="accent" href="/school/parents" />
      <StatCard label="Classes" value={k.classes.total} deltaLabel={entityDelta(k.classes.newThisWeek)} spark={k.classes.spark} tone="primary" href="/school/classes" />
      <StatCard label="Assiduité (30j)" value={k.attendanceRate !== null ? `${k.attendanceRate}%` : '—'} deltaPct={k.attendanceDeltaPct} spark={k.attendanceSpark} tone={k.attendanceRate !== null && k.attendanceRate < 90 ? 'amber' : 'emerald'} href="/school/attendance" />
      <StatCard label="Recettes (30j)" value={fmtFCFA(k.revenue30)} deltaPct={k.revenueDeltaPct} spark={k.revenueSpark} sub="encaissé" tone="primary" href="/school/finance/payments" />
      <StatCard label="Élèves à risque" value={k.risk.total} sub={k.risk.total > 0 ? `${k.risk.high} élevé · ${k.risk.medium} moyen` : 'aucun'} tone={k.risk.high > 0 ? 'red' : 'emerald'} href="/school/academic-support" />
      <StatCard label="Admissions" value={k.admissions.total} deltaLabel={entityDelta(k.admissions.newThisWeek)} spark={k.admissions.spark} tone="sky" href="/school/admissions" />
    </div>
  )
}

// ── Today's timeline ────────────────────────────────────────────────────────────
export function TimelineWidget({ items }: { items: AdminDashboard['timeline'] }) {
  return (
    <Widget title="Aujourd’hui" icon={P.clock}>
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">Aucune activité enregistrée aujourd’hui.</p>
      ) : (
        <ol className="relative ml-2 space-y-4 border-l border-sand-200 pl-5">
          {items.map((t, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[1.45rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary-500 shadow" />
              <p className="font-mono text-xs text-gray-400">{t.time}</p>
              <p className="text-sm text-gray-800">{t.label}</p>
            </li>
          ))}
        </ol>
      )}
    </Widget>
  )
}

// ── School health ───────────────────────────────────────────────────────────────
export function HealthWidget({ health }: { health: { score: number; band: HealthBand; dims: AdminDashboard['health']['dims'] } }) {
  return (
    <Widget title="Santé de l’école" icon={P.academic}>
      <div className="flex items-center gap-5">
        <ProgressRing value={health.score} label={HEALTH_BAND_LABEL[health.band]} size={104} className={health.score >= 70 ? 'text-emerald-500' : health.score >= 45 ? 'text-amber-500' : 'text-red-500'} />
        <div className="flex-1 space-y-1.5">
          {health.dims.map((d) => (
            <div key={d.label} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{d.label}</span>
              <span className={`font-bold ${d.good ? 'text-emerald-600' : 'text-amber-600'}`}>{d.dir === 'up' ? '▲' : '▼'}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-gray-400">Indicateurs dérivés en lecture seule</p>
    </Widget>
  )
}

// ── AI daily brief ──────────────────────────────────────────────────────────────
export function AiBriefWidget({ firstName, brief, reportHref }: { firstName: string; brief: AdminDashboard['brief']; reportHref: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50 to-accent-50 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white"><Icon d={P.ai} className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900">Bonjour {firstName} ✨</p>
          <p className="mt-0.5 text-sm text-gray-600">{brief.lead}</p>
          <ul className="mt-2 space-y-1">
            {brief.bullets.map((b, i) => <li key={i} className="flex items-start gap-2 text-sm text-gray-700"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />{b}</li>)}
          </ul>
          <Link href={reportHref} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:underline">Voir le rapport <Icon d={P.arrow} className="h-4 w-4" /></Link>
        </div>
      </div>
    </section>
  )
}

// ── Notifications ──────────────────────────────────────────────────────────────
export function NotificationsWidget({ items }: { items: NotificationPreview[] }) {
  return (
    <Widget title="Notifications" icon={P.bell} action={<a href="/notifications" className="text-xs font-medium text-primary-600 hover:underline">Tout voir →</a>}>
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">Aucune notification.</p>
      ) : (
        <ul className="divide-y divide-sand-100">
          {items.map((n) => (
            <li key={n.id} className={`flex items-start gap-3 py-2.5 ${n.read_at ? '' : '-mx-2 rounded-lg bg-primary-50/50 px-2'}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-sand-200' : 'bg-primary-500'}`} />
              <div className="min-w-0">
                <p className={`truncate text-sm ${n.read_at ? 'font-medium text-gray-700' : 'font-semibold text-gray-900'}`}>{n.title}</p>
                <p className="text-xs text-gray-400">{NOTIFICATION_TYPE_LABEL[n.type] ?? n.type} · {relTime(n.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  )
}

// ── Recent operational activity ─────────────────────────────────────────────────
export function ActivityWidget({ items }: { items: AdminDashboard['activity'] }) {
  return (
    <Widget title="Activité récente" icon={P.document}>
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">Aucune activité récente.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((a, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-gray-700">{a.label}</span>
              <span className="shrink-0 text-xs text-gray-400">{relTime(a.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  )
}

// ── Quick actions (grouped) ─────────────────────────────────────────────────────
export type QuickAction = { label: string; href: string; d: string; accent?: boolean }
export function QuickActionsWidget({ groups }: { groups: { title: string; actions: QuickAction[] }[] }) {
  return (
    <Widget title="Actions rapides" icon={P.ai}>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{g.title}</p>
            <div className="space-y-2">
              {g.actions.map((a) => (
                <Link key={a.href + a.label} href={a.href} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${a.accent ? 'border-accent-200 bg-accent-50 text-accent-800 hover:bg-accent-100' : 'border-sand-200 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50'}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${a.accent ? 'bg-accent-100 text-accent-700' : 'bg-primary-50 text-primary-700'}`}><Icon d={a.d} className="h-4 w-4" /></span>
                  {a.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Widget>
  )
}

// ── Copilot suggestions ─────────────────────────────────────────────────────────
export function CopilotWidget({ copilotPath, prompts }: { copilotPath: string; prompts: string[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50 to-accent-50 p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white"><Icon d={P.ai} className="h-6 w-6" /></span>
          <div>
            <h2 className="text-base font-bold text-gray-900">ScolaTech AI Copilot</h2>
            <p className="mt-0.5 text-sm text-gray-600">Posez vos questions en langage naturel — réponses en lecture seule à partir de vos données.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {prompts.map((q) => <Link key={q} href={copilotPath} className="rounded-full border border-primary-200 bg-white/70 px-3 py-1 text-xs font-medium text-primary-700 hover:bg-white">{q}</Link>)}
            </div>
          </div>
        </div>
        <Link href={copilotPath} className="shrink-0 self-start rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 sm:self-center">Ouvrir le Copilot</Link>
      </div>
    </section>
  )
}

// ── School cards ────────────────────────────────────────────────────────────────
export type SchoolCard = { id: string; name: string; roleLabel: string; roleBadge: string; role: string; students: number | null; setupPercent: number | null; ready: boolean; lastIso: string | null; portal: string | null }
export function SchoolCardsWidget({ cards, multi, isSuperAdmin }: { cards: SchoolCard[]; multi: boolean; isSuperAdmin: boolean }) {
  return (
    <Widget title={multi ? 'Mes établissements' : 'Mon établissement'} icon={P.classes}>
      {cards.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">{isSuperAdmin ? 'Vous gérez la plateforme via le centre de commande.' : 'Aucun établissement rattaché à votre compte. Contactez votre administrateur.'}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((c) => (
            <div key={c.id} className="flex flex-col gap-3 rounded-xl border border-sand-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-900">{c.name}</p>
                  <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${c.roleBadge}`}>{c.roleLabel}</span>
                </div>
                {c.setupPercent !== null && <ProgressRing value={c.setupPercent} label="config" size={56} className={c.ready ? 'text-emerald-500' : 'text-primary-600'} />}
              </div>
              {c.role === 'school_admin' && (
                <div className="flex items-center gap-3 text-xs text-gray-500"><span>{c.students} élève(s)</span><span className="text-gray-300">·</span><span>Activité {relTime(c.lastIso)}</span></div>
              )}
              {c.portal ? (
                <a href={c.portal} className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700">Accéder <Icon d={P.arrow} className="h-4 w-4" /></a>
              ) : <span className="mt-auto text-center text-xs text-gray-400">Portail à venir</span>}
            </div>
          ))}
        </div>
      )}
    </Widget>
  )
}

// ── Super-admin command panel ────────────────────────────────────────────────────
export function SuperAdminWidget({ ops }: { ops: PlatformOps }) {
  const pilots = ops.schools.filter((s) => s.isPilot).length
  const alerts = ops.kpis.risk + ops.kpis.dormantBand
  const stats: { label: string; value: number; sub?: string; tone: Tone }[] = [
    { label: 'Écoles', value: ops.kpis.total, sub: `${ops.kpis.active} actives`, tone: 'primary' },
    { label: 'Pilotes', value: pilots, sub: 'cohorte', tone: 'sky' },
    { label: 'Tickets ouverts', value: ops.kpis.openTickets, tone: ops.kpis.openTickets > 0 ? 'amber' : 'emerald' },
    { label: 'Alertes santé', value: alerts, sub: `${ops.alerts.length} alerte(s)`, tone: alerts > 0 ? 'red' : 'emerald' },
  ]
  return (
    <Widget title="Centre de commande plateforme" icon={P.academic} action={<a href="/super-admin/command-center" className="text-xs font-medium text-primary-600 hover:underline">Ouvrir →</a>}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} tone={s.tone} />)}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Centre de commande', href: '/super-admin/command-center' },
          { label: 'Pilotes', href: '/super-admin/pilots' },
          { label: 'Support', href: '/super-admin/support' },
          { label: 'Supervision', href: '/super-admin/monitoring' },
        ].map((b) => <a key={b.href} href={b.href} className="rounded-lg border border-sand-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50">{b.label}</a>)}
      </div>
    </Widget>
  )
}
