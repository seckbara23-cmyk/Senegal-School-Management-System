import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSetupState } from '@/lib/setup'
import { loadSchoolRisk } from '@/lib/academic/risk-data'
import { computeHealth, HEALTH_BAND_LABEL, HEALTH_BAND_CLASS } from '@/lib/platform/health'
import { loadPlatformOps } from '@/lib/platform/ops'
import { getNotificationSummary, NOTIFICATION_TYPE_LABEL } from '@/lib/notifications'
import { KpiCard, Panel, ProgressRing } from '@/components/charts'

export const dynamic = 'force-dynamic'

// Maps implemented roles to their portal landing path. (The school-admin portal
// index at /school IS the admin dashboard.)
const ROLE_PATHS: Record<string, string> = {
  school_admin: '/school', teacher: '/teacher', finance_officer: '/finance-officer', parent: '/parent', student: '/student',
}
const PROFILE_LINKED_TABLE: Record<string, string> = { student: 'students', parent: 'parents', teacher: 'teachers' }
const COPILOT_PATHS: Record<string, string> = { school_admin: '/school/copilot', teacher: '/teacher/copilot', parent: '/parent/copilot' }

const ROLE_LABEL: Record<string, string> = {
  school_admin: 'Administrateur', teacher: 'Enseignant', finance_officer: 'Comptable', parent: 'Parent', student: 'Élève',
}
const ROLE_BADGE: Record<string, string> = {
  school_admin: 'border-primary-200 bg-primary-50 text-primary-700',
  teacher: 'border-sky-200 bg-sky-50 text-sky-700',
  finance_officer: 'border-amber-200 bg-amber-50 text-amber-700',
  parent: 'border-accent-200 bg-accent-50 text-accent-700',
  student: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}

const P = {
  userPlus: 'M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z',
  teacher: 'M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5',
  classes: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  money: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  timetable: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  ai: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z',
  arrow: 'M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3',
}
function Icon({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>
}

const fmtFCFA = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA'

function relTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'à l’instant'
  if (m < 60) return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d < 30) return `il y a ${d} j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

type Membership = { id: string; role: string; school_id: string; schools: { id: string; name: string; slug: string; subscription_status: string } | null }

async function loadAdminKpis(supabase: ReturnType<typeof createClient>, schoolId: string, subscriptionStatus: string) {
  const cutoff30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const { data: yr } = await supabase.from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle()
  const yearId = (yr as { id: string } | null)?.id ?? null

  const classesQ = yearId
    ? supabase.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('academic_year_id', yearId)
    : supabase.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', schoolId)

  const [studentsC, teachersC, parentsC, classesC, invRes, sess30, risk, lastAct] = await Promise.all([
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
    supabase.from('parents').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
    classesQ,
    supabase.from('student_invoices').select('total_amount, amount_paid, status').eq('school_id', schoolId).neq('status', 'cancelled'),
    supabase.from('attendance_sessions').select('id').eq('school_id', schoolId).gte('session_date', cutoff30),
    loadSchoolRisk(supabase, schoolId),
    supabase.from('audit_logs').select('created_at').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  let attendanceRate: number | null = null
  const sessIds = ((sess30.data ?? []) as { id: string }[]).map((s) => s.id)
  if (sessIds.length > 0) {
    const [totalRes, absentRes] = await Promise.all([
      supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).in('session_id', sessIds),
      supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'absent').in('session_id', sessIds),
    ])
    const total = totalRes.count ?? 0, absent = absentRes.count ?? 0
    attendanceRate = total > 0 ? Math.round(((total - absent) / total) * 100) : null
  }

  const inv = (invRes.data ?? []) as { total_amount: number; amount_paid: number; status: string }[]
  const invoiced = inv.reduce((s, i) => s + i.total_amount, 0)
  const collected = inv.reduce((s, i) => s + i.amount_paid, 0)
  const unpaid = inv.filter((i) => i.status === 'unpaid' || i.status === 'partial')
  const outstanding = unpaid.reduce((s, i) => s + (i.total_amount - i.amount_paid), 0)
  const collectionRate = invoiced > 0 ? Math.round((collected / invoiced) * 100) : null
  const students = studentsC.count ?? 0
  const lastIso = (lastAct.data as { created_at: string } | null)?.created_at ?? null
  const daysSinceActivity = lastIso ? Math.floor((Date.now() - new Date(lastIso).getTime()) / 86_400_000) : null
  const health = computeHealth({ subscriptionStatus, billingStatus: null, daysSinceActivity, collectionRate, activeStudents: students })

  return {
    students, teachers: teachersC.count ?? 0, parents: parentsC.count ?? 0, classes: classesC.count ?? 0,
    attendanceRate, outstanding, outstandingCount: unpaid.length, risk: risk.summary, health, lastIso,
  }
}

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipsRes] = await Promise.all([
    supabase.from('profiles').select('full_name, global_role').eq('id', user.id).single(),
    supabase.from('school_memberships').select('id, role, school_id, schools(id, name, slug, subscription_status)').eq('user_id', user.id).eq('status', 'active'),
  ])
  const { data: profile, error: profileError } = profileRes
  const { data: membershipsData, error: membershipsError } = membershipsRes
  const memberships = (membershipsData ?? []) as unknown as Membership[]
  const isSuperAdmin = profile?.global_role === 'super_admin'

  // ── Auto-route single-school users straight to their portal (unchanged). ─────
  if (!isSuperAdmin && !profileError && !membershipsError && memberships.length === 1) {
    const m = memberships[0]
    const target = ROLE_PATHS[m.role]
    if (target) {
      const linkedTable = PROFILE_LINKED_TABLE[m.role]
      let canEnter = true
      if (linkedTable) {
        const { data: linkedRecord } = await supabase.from(linkedTable).select('id').eq('profile_id', user.id).eq('school_id', m.school_id).maybeSingle()
        canEnter = Boolean(linkedRecord)
      }
      if (canEnter) redirect(target)
    }
  }

  const firstName = (profile?.full_name || user.email || '').split(/\s+/)[0] || 'bienvenue'
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  const primaryAdmin = memberships.find((m) => m.role === 'school_admin') ?? null
  const primary = primaryAdmin ?? memberships[0] ?? null
  const copilotPath = primary ? COPILOT_PATHS[primary.role] ?? null : null

  // Parallel: super-admin platform ops, primary-school KPIs, notifications.
  const [ops, kpis, notif] = await Promise.all([
    isSuperAdmin ? loadPlatformOps() : Promise.resolve(null),
    primaryAdmin ? loadAdminKpis(supabase, primaryAdmin.school_id, primaryAdmin.schools?.subscription_status ?? 'active') : Promise.resolve(null),
    getNotificationSummary(supabase, user.id, 5),
  ])

  // Rich school cards (one query batch per membership).
  const cards = await Promise.all(memberships.map(async (m) => {
    const base = { id: m.id, schoolId: m.school_id, name: m.schools?.name ?? '—', role: m.role, portal: ROLE_PATHS[m.role] ?? null }
    if (m.role !== 'school_admin') return { ...base, students: null as number | null, setupPercent: null as number | null, ready: false, lastIso: null as string | null }
    const [studentsC, setup, lastAct] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', m.school_id),
      getSetupState(supabase, m.school_id),
      supabase.from('audit_logs').select('created_at').eq('school_id', m.school_id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    return { ...base, students: studentsC.count ?? 0, setupPercent: setup.percent, ready: setup.ready, lastIso: (lastAct.data as { created_at: string } | null)?.created_at ?? null }
  }))

  const QUICK_ACTIONS = primaryAdmin ? [
    { label: 'Nouvel élève', href: '/school/students/new', d: P.userPlus },
    { label: 'Nouvel enseignant', href: '/school/teachers/new', d: P.teacher },
    { label: 'Nouvelle classe', href: '/school/classes/new', d: P.classes },
    { label: 'Créer une facture', href: '/school/finance/invoices/new', d: P.money },
    { label: 'Générer l’emploi du temps', href: '/school/timetable/generate', d: P.timetable },
    { label: 'Demander à ScolaTech AI', href: copilotPath ?? '/school/copilot', d: P.ai, accent: true },
  ] : []

  return (
    <div className="space-y-6 pb-10">

      {(profileError || membershipsError) && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-sm text-red-700">Échec du chargement des données du compte. Veuillez actualiser la page.</p></div>
      )}

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-800 via-primary-800 to-primary-700 px-6 py-7 shadow-sm sm:px-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-48 w-48 rounded-full bg-accent-500/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            {primary && <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ROLE_BADGE[primary.role] ?? 'border-white/20 bg-white/10 text-white'}`}>{ROLE_LABEL[primary.role] ?? primary.role}</span>}
            {isSuperAdmin && <span className="rounded-full border border-accent-300/40 bg-accent-500/15 px-2.5 py-0.5 text-xs font-semibold text-accent-200">Super Admin</span>}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Bonjour, {firstName} 👋</h1>
          <p className="mt-1 text-sm text-primary-200">
            {primary ? <>Voici l’aperçu de <span className="font-semibold text-white">{primary.schools?.name}</span> · <span className="capitalize">{today}</span></> : <>Votre espace ScolaTech · <span className="capitalize">{today}</span></>}
          </p>
          {kpis && (
            <p className="mt-1 text-sm text-primary-300">
              {kpis.students} élèves · assiduité {kpis.attendanceRate ?? '—'}% · {kpis.outstanding > 0 ? `${fmtFCFA(kpis.outstanding)} à encaisser` : 'paiements à jour'}
            </p>
          )}

          {copilotPath && (
            <Link href={copilotPath} className="mt-5 flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur transition-colors hover:bg-white/15">
              <Icon d={P.ai} className="h-5 w-5 text-accent-200" />
              <span className="flex-1 text-sm text-primary-100">Demandez à ScolaTech AI — « Comment va l’école ? »</span>
              <Icon d={P.arrow} className="h-4 w-4 text-primary-200" />
            </Link>
          )}
        </div>
      </section>

      {/* ── Super-admin command panel ────────────────────────────────────────── */}
      {isSuperAdmin && ops && (
        <Panel title="Centre de commande plateforme" action={<a href="/super-admin/command-center" className="text-xs font-medium text-primary-600 hover:underline">Ouvrir →</a>}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Écoles" value={ops.kpis.total} sub={`${ops.kpis.active} actives`} tone="primary" />
            <KpiCard label="Pilotes" value={ops.schools.filter((s) => s.isPilot).length} sub="cohorte" tone="sky" />
            <KpiCard label="Tickets ouverts" value={ops.kpis.openTickets} tone={ops.kpis.openTickets > 0 ? 'amber' : 'emerald'} />
            <KpiCard label="Alertes santé" value={ops.kpis.risk + ops.kpis.dormantBand} sub={`${ops.alerts.length} alerte(s)`} tone={ops.kpis.risk + ops.kpis.dormantBand > 0 ? 'red' : 'emerald'} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Centre de commande', href: '/super-admin/command-center' },
              { label: 'Pilotes', href: '/super-admin/pilots' },
              { label: 'Support', href: '/super-admin/support' },
              { label: 'Supervision', href: '/super-admin/monitoring' },
            ].map((b) => (
              <a key={b.href} href={b.href} className="rounded-lg border border-sand-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50">{b.label}</a>
            ))}
          </div>
        </Panel>
      )}

      {/* ── KPI cards (primary school) ───────────────────────────────────────── */}
      {kpis && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Aperçu de l’établissement</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <KpiCard label="Élèves" value={kpis.students} href="/school/students" tone="primary" />
            <KpiCard label="Enseignants" value={kpis.teachers} href="/school/teachers" tone="sky" />
            <KpiCard label="Parents" value={kpis.parents} href="/school/parents" tone="accent" />
            <KpiCard label="Classes" value={kpis.classes} href="/school/classes" tone="primary" />
            <KpiCard label="Assiduité (30j)" value={kpis.attendanceRate !== null ? `${kpis.attendanceRate}%` : '—'} href="/school/attendance" tone={kpis.attendanceRate !== null && kpis.attendanceRate < 90 ? 'amber' : 'emerald'} />
            <KpiCard label="À encaisser" value={kpis.outstanding > 0 ? fmtFCFA(kpis.outstanding) : 'À jour'} sub={kpis.outstandingCount > 0 ? `${kpis.outstandingCount} facture(s)` : undefined} href="/school/finance/invoices" tone={kpis.outstanding > 0 ? 'amber' : 'emerald'} />
            <KpiCard label="Élèves à risque" value={kpis.risk.total} sub={kpis.risk.total > 0 ? `${kpis.risk.high} élevé` : 'aucun'} href="/school/academic-support" tone={kpis.risk.high > 0 ? 'red' : 'emerald'} />
            <KpiCard label="Notifications" value={notif.unreadCount} sub="non lues" href="/notifications" tone={notif.unreadCount > 0 ? 'amber' : 'gray'} />
          </div>
        </div>
      )}

      {/* ── Quick actions ────────────────────────────────────────────────────── */}
      {QUICK_ACTIONS.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Actions rapides</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {QUICK_ACTIONS.map((a) => (
              <Link key={a.href + a.label} href={a.href}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center shadow-sm transition-all hover:shadow-md ${a.accent ? 'border-accent-200 bg-accent-50 hover:border-accent-300' : 'border-sand-200 bg-white hover:border-primary-300 hover:bg-primary-50'}`}>
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${a.accent ? 'bg-accent-100 text-accent-700' : 'bg-primary-50 text-primary-700'}`}><Icon d={a.d} className="h-5 w-5" /></span>
                <span className="text-xs font-semibold text-gray-800 leading-tight">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── School cards ───────────────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <Panel title={memberships.length > 1 ? 'Mes établissements' : 'Mon établissement'}>
            {cards.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">{isSuperAdmin ? 'Vous gérez la plateforme via le centre de commande.' : 'Aucun établissement rattaché à votre compte. Contactez votre administrateur.'}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {cards.map((c) => (
                  <div key={c.id} className="flex flex-col gap-3 rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-gray-900">{c.name}</p>
                        <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE[c.role] ?? 'border-sand-200 bg-sand-50 text-gray-600'}`}>{ROLE_LABEL[c.role] ?? c.role}</span>
                      </div>
                      {c.setupPercent !== null && <ProgressRing value={c.setupPercent} label="config" size={56} className={c.ready ? 'text-emerald-500' : 'text-primary-600'} />}
                    </div>
                    {c.role === 'school_admin' && (
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{c.students} élève(s)</span>
                        <span className="text-gray-300">·</span>
                        <span>Activité {relTime(c.lastIso)}</span>
                      </div>
                    )}
                    {c.portal ? (
                      <a href={c.portal} className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700">
                        Accéder <Icon d={P.arrow} className="h-4 w-4" />
                      </a>
                    ) : <span className="mt-auto text-center text-xs text-gray-400">Portail à venir</span>}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* ── Notifications preview ──────────────────────────────────────────── */}
        <div>
          <Panel title="Notifications" action={<a href="/notifications" className="text-xs font-medium text-primary-600 hover:underline">Tout voir →</a>}>
            {notif.recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Aucune notification.</p>
            ) : (
              <ul className="divide-y divide-sand-100">
                {notif.recent.map((n) => (
                  <li key={n.id} className="flex items-start gap-3 py-2.5">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-sand-200' : 'bg-primary-500'}`} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-800">{n.title}</p>
                      <p className="text-xs text-gray-400">{NOTIFICATION_TYPE_LABEL[n.type] ?? n.type} · {relTime(n.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* ── Copilot block ────────────────────────────────────────────────────── */}
      {copilotPath && (
        <section className="overflow-hidden rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50 to-accent-50 p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white"><Icon d={P.ai} className="h-6 w-6" /></span>
              <div>
                <h2 className="text-base font-bold text-gray-900">ScolaTech AI Copilot</h2>
                <p className="mt-0.5 text-sm text-gray-600">Posez vos questions en langage naturel — réponses en lecture seule à partir de vos données.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {['Comment va l’école ?', 'Quels élèves sont à risque ?', 'Résumé financier'].map((q) => (
                    <Link key={q} href={copilotPath} className="rounded-full border border-primary-200 bg-white/70 px-3 py-1 text-xs font-medium text-primary-700 hover:bg-white">{q}</Link>
                  ))}
                </div>
              </div>
            </div>
            <Link href={copilotPath} className="shrink-0 self-start rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 sm:self-center">Ouvrir le Copilot</Link>
          </div>
        </section>
      )}

      {/* ── Health badge (primary school) ────────────────────────────────────── */}
      {kpis && (
        <p className="text-center text-xs text-gray-400">
          Santé de l’établissement : <span className={`rounded-full border px-2 py-0.5 font-semibold ${HEALTH_BAND_CLASS[kpis.health.band]}`}>{HEALTH_BAND_LABEL[kpis.health.band]}</span> · indicateurs dérivés en lecture seule
        </p>
      )}
    </div>
  )
}
