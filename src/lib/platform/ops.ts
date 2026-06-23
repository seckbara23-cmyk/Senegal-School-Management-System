// ─── Platform operations aggregator (super-admin, derived, service-role) ──────
//
// One bounded cross-school load powering the command center, health, monitoring,
// adoption and pilot views. Aggregated in JS from existing tables + audit_logs —
// no per-school analytics loop, no new metric tables. (At larger scale, move the
// grouped counts to read-only RPCs or a daily snapshot — see the design notes.)

import { createAdminClient } from '@/lib/supabase/admin'
import { computeHealth, type SchoolHealth } from './health'

function one<T>(v: T | T[] | null | undefined): T | null { return v == null ? null : (Array.isArray(v) ? (v[0] ?? null) : v) }

export const FEATURES: { key: string; label: string; table: string }[] = [
  { key: 'attendance', label: 'Présences', table: 'attendance_sessions' },
  { key: 'grades', label: 'Notes', table: 'grades' },
  { key: 'invoicing', label: 'Facturation', table: 'student_invoices' },
  { key: 'homework', label: 'Devoirs', table: 'homework' },
  { key: 'messaging', label: 'Messagerie', table: 'messages' },
  { key: 'admissions', label: 'Admissions', table: 'admission_applications' },
  { key: 'timetable', label: 'Emploi du temps', table: 'timetable_slots' },
  { key: 'transport', label: 'Transport', table: 'student_transport_assignments' },
  { key: 'plans', label: 'Échéanciers', table: 'payment_plans' },
  { key: 'online_pay', label: 'Paiements en ligne', table: 'payment_requests' },
]

export type PlatformSchool = {
  id: string; name: string; slug: string; subscriptionStatus: string; plan: string; isPilot: boolean
  createdAt: string; trialEndsAt: string | null; billingStatus: string | null; monthlyPrice: number
  activeStudents: number; activeTeachers: number; invoiced: number; collected: number; outstanding: number
  collectionRate: number | null; lastActivity: string | null; daysSinceActivity: number | null
  health: SchoolHealth; features: string[]
}

export type PlatformAlert = { kind: string; severity: 'warning' | 'critical'; label: string; schoolId: string; schoolName: string }

export type PlatformOps = {
  schools: PlatformSchool[]
  kpis: {
    total: number; active: number; suspended: number; archived: number
    trialExpiringSoon: number; activated: number; activationRate: number; dormant: number
    mrr: number; healthy: number; watch: number; risk: number; dormantBand: number; openTickets: number
  }
  adoption: { key: string; label: string; count: number; rate: number }[]
  alerts: PlatformAlert[]
}

function countActiveBySchool(rows: { school_id: string; status: string }[] | null): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows ?? []) if (r.status === 'active') m.set(r.school_id, (m.get(r.school_id) ?? 0) + 1)
  return m
}

export async function loadPlatformOps(): Promise<PlatformOps> {
  const admin = createAdminClient()
  const now = Date.now()

  const [schoolsRes, subsRes, studentsRes, teachersRes, invoicesRes, activityRes, ticketsRes, ...featureRes] = await Promise.all([
    admin.from('schools').select('id, name, slug, subscription_status, subscription_plan, is_pilot, created_at, trial_ends_at'),
    admin.from('school_subscriptions').select('school_id, status, subscription_plans!plan_id(code, monthly_price)'),
    admin.from('students').select('school_id, status'),
    admin.from('teachers').select('school_id, status'),
    admin.from('student_invoices').select('school_id, total_amount, amount_paid, status'),
    admin.from('audit_logs').select('school_id, created_at').order('created_at', { ascending: false }).limit(5000),
    admin.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress', 'waiting']),
    ...FEATURES.map((f) => admin.from(f.table).select('school_id')),
  ])

  const schools = (schoolsRes.data ?? []) as { id: string; name: string; slug: string; subscription_status: string; subscription_plan: string; is_pilot: boolean; created_at: string; trial_ends_at: string | null }[]

  const subBy = new Map<string, { status: string; code: string | null; monthly: number }>()
  for (const s of (subsRes.data ?? []) as { school_id: string; status: string; subscription_plans: unknown }[]) {
    const plan = one<{ code: string; monthly_price: number }>(s.subscription_plans as never)
    subBy.set(s.school_id, { status: s.status, code: plan?.code ?? null, monthly: plan?.monthly_price ?? 0 })
  }

  const activeStudents = countActiveBySchool(studentsRes.data as never)
  const activeTeachers = countActiveBySchool(teachersRes.data as never)

  const invBy = new Map<string, { invoiced: number; collected: number }>()
  for (const i of (invoicesRes.data ?? []) as { school_id: string; total_amount: number; amount_paid: number; status: string }[]) {
    if (i.status === 'cancelled') continue
    const cur = invBy.get(i.school_id) ?? { invoiced: 0, collected: 0 }
    cur.invoiced += i.total_amount; cur.collected += i.amount_paid; invBy.set(i.school_id, cur)
  }

  const lastAct = new Map<string, string>() // ordered desc → first seen is most recent
  for (const a of (activityRes.data ?? []) as { school_id: string | null; created_at: string }[]) {
    if (a.school_id && !lastAct.has(a.school_id)) lastAct.set(a.school_id, a.created_at)
  }

  const featureSets = FEATURES.map((_, idx) => new Set(((featureRes[idx].data ?? []) as { school_id: string | null }[]).map((r) => r.school_id).filter((x): x is string => !!x)))

  const list: PlatformSchool[] = schools.map((s) => {
    const inv = invBy.get(s.id)
    const collectionRate = inv && inv.invoiced > 0 ? Math.round((inv.collected / inv.invoiced) * 100) : null
    const last = lastAct.get(s.id) ?? null
    const daysSinceActivity = last ? Math.floor((now - new Date(last).getTime()) / 86_400_000) : null
    const sub = subBy.get(s.id)
    const students = activeStudents.get(s.id) ?? 0
    const health = computeHealth({ subscriptionStatus: s.subscription_status, billingStatus: sub?.status ?? null, daysSinceActivity, collectionRate, activeStudents: students })
    const features = FEATURES.filter((_, idx) => featureSets[idx].has(s.id)).map((f) => f.key)
    return {
      id: s.id, name: s.name, slug: s.slug, subscriptionStatus: s.subscription_status, plan: sub?.code ?? s.subscription_plan, isPilot: s.is_pilot,
      createdAt: s.created_at, trialEndsAt: s.trial_ends_at, billingStatus: sub?.status ?? null, monthlyPrice: sub?.monthly ?? 0,
      activeStudents: students, activeTeachers: activeTeachers.get(s.id) ?? 0,
      invoiced: inv?.invoiced ?? 0, collected: inv?.collected ?? 0, outstanding: (inv?.invoiced ?? 0) - (inv?.collected ?? 0),
      collectionRate, lastActivity: last, daysSinceActivity, health, features,
    }
  }).sort((a, b) => a.health.score - b.health.score)

  const nonArchived = list.filter((s) => s.subscriptionStatus !== 'archived')
  const activeAccess = list.filter((s) => s.subscriptionStatus === 'active')
  const activated = nonArchived.filter((s) => s.activeStudents > 0).length

  const alerts: PlatformAlert[] = []
  for (const s of activeAccess) {
    if (s.trialEndsAt) { const d = Math.floor((new Date(s.trialEndsAt).getTime() - now) / 86_400_000); if (d >= 0 && d <= 7) alerts.push({ kind: 'trial', severity: 'warning', label: `Essai expire dans ${d} j`, schoolId: s.id, schoolName: s.name }) }
    if (s.billingStatus === 'past_due') alerts.push({ kind: 'billing', severity: 'warning', label: 'Facturation en retard', schoolId: s.id, schoolName: s.name })
    if (s.activeStudents > 0 && (s.daysSinceActivity === null || s.daysSinceActivity > 30)) alerts.push({ kind: 'dormant', severity: 'critical', label: 'Inactive depuis plus de 30 jours', schoolId: s.id, schoolName: s.name })
    else if (s.health.band === 'dormant') alerts.push({ kind: 'health', severity: 'critical', label: 'Score de santé critique', schoolId: s.id, schoolName: s.name })
  }

  const adoption = FEATURES.map((f, idx) => {
    const count = activeAccess.filter((s) => featureSets[idx].has(s.id)).length
    return { key: f.key, label: f.label, count, rate: activeAccess.length > 0 ? Math.round((count / activeAccess.length) * 100) : 0 }
  })

  return {
    schools: list,
    kpis: {
      total: list.length,
      active: activeAccess.length,
      suspended: list.filter((s) => s.subscriptionStatus === 'suspended').length,
      archived: list.filter((s) => s.subscriptionStatus === 'archived').length,
      trialExpiringSoon: alerts.filter((a) => a.kind === 'trial').length,
      activated, activationRate: nonArchived.length > 0 ? Math.round((activated / nonArchived.length) * 100) : 0,
      dormant: activeAccess.filter((s) => s.activeStudents > 0 && (s.daysSinceActivity === null || s.daysSinceActivity > 30)).length,
      mrr: activeAccess.reduce((sum, s) => sum + s.monthlyPrice, 0),
      healthy: activeAccess.filter((s) => s.health.band === 'healthy').length,
      watch: activeAccess.filter((s) => s.health.band === 'watch').length,
      risk: activeAccess.filter((s) => s.health.band === 'risk').length,
      dormantBand: activeAccess.filter((s) => s.health.band === 'dormant').length,
      openTickets: ticketsRes.count ?? 0,
    },
    adoption,
    alerts: alerts.sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1)),
  }
}
