import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSetupState } from '@/lib/setup'
import { loadPlatformOps } from '@/lib/platform/ops'
import { getNotificationSummary } from '@/lib/notifications'
import { loadAdminDashboard } from '@/lib/dashboard/admin'
import { fmtFCFA, P, SectionTitle } from './_widget'
import {
  HeroWidget, AlertsWidget, KpiGrid, TimelineWidget, HealthWidget, AiBriefWidget,
  NotificationsWidget, ActivityWidget, QuickActionsWidget, CopilotWidget, SchoolCardsWidget, SuperAdminWidget,
  type SchoolCard, type QuickAction,
} from './_widgets'

export const dynamic = 'force-dynamic'

const ROLE_PATHS: Record<string, string> = { school_admin: '/school', teacher: '/teacher', finance_officer: '/finance-officer', parent: '/parent', student: '/student' }
const PROFILE_LINKED_TABLE: Record<string, string> = { student: 'students', parent: 'parents', teacher: 'teachers' }
const COPILOT_PATHS: Record<string, string> = { school_admin: '/school/copilot', teacher: '/teacher/copilot', parent: '/parent/copilot' }
const ROLE_LABEL: Record<string, string> = { school_admin: 'Administrateur', teacher: 'Enseignant', finance_officer: 'Comptable', parent: 'Parent', student: 'Élève' }
const ROLE_BADGE: Record<string, string> = {
  school_admin: 'border-primary-200 bg-primary-50 text-primary-700', teacher: 'border-sky-200 bg-sky-50 text-sky-700',
  finance_officer: 'border-amber-200 bg-amber-50 text-amber-700', parent: 'border-accent-200 bg-accent-50 text-accent-700', student: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}

type Membership = { id: string; role: string; school_id: string; schools: { id: string; name: string; slug: string; subscription_status: string } | null }

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

  // ── Single-school auto-route (unchanged behavior). ───────────────────────────
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

  // ── Derived data (parallel). ─────────────────────────────────────────────────
  const [ops, dash, notif] = await Promise.all([
    isSuperAdmin ? loadPlatformOps() : Promise.resolve(null),
    primaryAdmin ? loadAdminDashboard(supabase, primaryAdmin.school_id, user.id, primaryAdmin.schools?.subscription_status ?? 'active') : Promise.resolve(null),
    getNotificationSummary(supabase, user.id, 5),
  ])

  // Rich school cards (one batch per membership).
  const cards: SchoolCard[] = await Promise.all(memberships.map(async (m): Promise<SchoolCard> => {
    const base = { id: m.id, name: m.schools?.name ?? '—', role: m.role, roleLabel: ROLE_LABEL[m.role] ?? m.role, roleBadge: ROLE_BADGE[m.role] ?? 'border-sand-200 bg-sand-50 text-gray-600', portal: ROLE_PATHS[m.role] ?? null }
    if (m.role !== 'school_admin') return { ...base, students: null, setupPercent: null, ready: false, lastIso: null }
    const [studentsC, setup, lastAct] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', m.school_id),
      getSetupState(supabase, m.school_id),
      supabase.from('audit_logs').select('created_at').eq('school_id', m.school_id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    return { ...base, students: studentsC.count ?? 0, setupPercent: setup.percent, ready: setup.ready, lastIso: (lastAct.data as { created_at: string } | null)?.created_at ?? null }
  }))

  const summaryLine = dash
    ? `${dash.kpis.students.total} élèves · assiduité ${dash.kpis.attendanceRate ?? '—'}% · ${dash.outstanding > 0 ? `${fmtFCFA(dash.outstanding)} à encaisser` : 'paiements à jour'}`
    : undefined

  const quickGroups: { title: string; actions: QuickAction[] }[] = primaryAdmin ? [
    { title: 'Pédagogie', actions: [
      { label: 'Nouvel élève', href: '/school/students/new', d: P.userPlus },
      { label: 'Nouvelle classe', href: '/school/classes/new', d: P.classes },
      { label: 'Générer l’emploi du temps', href: '/school/timetable/generate', d: P.timetable },
    ] },
    { title: 'Finance', actions: [
      { label: 'Créer une facture', href: '/school/finance/invoices/new', d: P.money },
      { label: 'Voir les paiements', href: '/school/finance/payments', d: P.money },
    ] },
    { title: 'IA', actions: [
      { label: 'Demander à ScolaTech AI', href: copilotPath ?? '/school/copilot', d: P.ai, accent: true },
    ] },
  ] : []

  // ── Widget registry — ordered top→bottom by information hierarchy. A future ───
  // phase can persist visibility/order/size against this list without touching
  // widget internals (each widget has a stable id + a consistent prop API).
  return (
    <div className="space-y-6 pb-10">

      {(profileError || membershipsError) && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-sm text-red-700">Échec du chargement des données du compte. Veuillez actualiser la page.</p></div>
      )}

      {/* 1 · Hero + AI bar */}
      <HeroWidget
        firstName={firstName}
        schoolName={primary?.schools?.name}
        roleLabel={primary ? ROLE_LABEL[primary.role] ?? primary.role : undefined}
        roleBadge={primary ? ROLE_BADGE[primary.role] : undefined}
        isSuperAdmin={isSuperAdmin}
        today={today}
        summaryLine={summaryLine}
        copilotPath={copilotPath}
      />

      {/* 2 · Critical alerts (school admin) */}
      {dash && <AlertsWidget alerts={dash.alerts} />}

      {/* Super-admin command panel sits high for platform operators */}
      {isSuperAdmin && ops && <SuperAdminWidget ops={ops} />}

      {/* 3 · AI daily brief (deterministic) — today's overview */}
      {dash && copilotPath && <AiBriefWidget firstName={firstName} brief={dash.brief} reportHref={copilotPath} />}

      {/* 4 · Key KPIs */}
      {dash && (
        <div>
          <SectionTitle>Indicateurs clés</SectionTitle>
          <KpiGrid kpis={dash.kpis} />
        </div>
      )}

      {/* 5–6 · Timeline + School health */}
      {dash && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><TimelineWidget items={dash.timeline} /></div>
          <HealthWidget health={dash.health} />
        </div>
      )}

      {/* 7 · Quick actions */}
      {quickGroups.length > 0 && <QuickActionsWidget groups={quickGroups} />}

      {/* 8–9 · School cards + recent activity + notifications */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><SchoolCardsWidget cards={cards} multi={memberships.length > 1} isSuperAdmin={isSuperAdmin} /></div>
        <div className="space-y-6">
          <NotificationsWidget items={notif.recent} />
          {dash && <ActivityWidget items={dash.activity} />}
        </div>
      </div>

      {/* 10 · Copilot suggestions */}
      {copilotPath && <CopilotWidget copilotPath={copilotPath} prompts={['Comment va l’école ?', 'Quels élèves sont à risque ?', 'Résumé financier', 'Que dois-je surveiller cette semaine ?']} />}
    </div>
  )
}
