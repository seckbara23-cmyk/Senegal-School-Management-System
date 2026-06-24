// ─── Pilot execution aggregators (derived, super-admin, service-role) ────────
//
// Builds the pilot-execution surfaces (tracker, onboarding workspace, commercial
// readiness, cohort adoption) entirely from existing tables. Reuses loadPlatform
// Ops (cohort + health + features + tickets), getSetupState (onboarding funnel),
// the MILESTONES catalogue (time-to-value from audit_logs) and support_tickets
// (feedback rides on a category convention). No new tables.

import { createAdminClient } from '@/lib/supabase/admin'
import { getSetupState, type SetupState } from '@/lib/setup'
import { loadPlatformOps, FEATURES, type PlatformSchool } from './ops'
import { MILESTONES, median } from './pilots'
import type { HealthBand } from './health'

const OPEN_TICKET = ['open', 'in_progress', 'waiting']
export const FEEDBACK_PREFIX = 'feedback_'

// ── Per-school tracker rows + cohort rollup ──────────────────────────────────
export type PilotTrackerRow = {
  school: PlatformSchool
  onboardingPercent: number
  ready: boolean
  stepsRemaining: string[]
  milestonesReached: number
  milestonesTotal: number
  ttvDays: number | null          // days to first student (activation)
  daysSinceActivity: number | null
  openTickets: number
  feedbackCount: number
  featureCount: number
}

export type PilotSummary = {
  cohortSize: number
  avgOnboarding: number
  readyCount: number
  activated: number
  activationRate: number
  engaged7d: number
  engagementRate: number
  medianTtvDays: number | null
  avgFeatures: number
  featureTotal: number
  openTickets: number
  feedbackCount: number
  health: Record<HealthBand, number>
}

export type PilotExecution = { cohort: PlatformSchool[]; rows: PilotTrackerRow[]; summary: PilotSummary }

async function milestoneTimes(admin: ReturnType<typeof createAdminClient>, ids: string[]): Promise<Map<string, Map<string, number>>> {
  // schoolId → (milestoneKey → earliest epoch ms)
  const out = new Map<string, Map<string, number>>()
  if (ids.length === 0) return out
  const actions = MILESTONES.flatMap((m) => m.actions)
  const { data } = await admin.from('audit_logs').select('school_id, action, created_at').in('school_id', ids).in('action', actions)
  for (const r of (data ?? []) as { school_id: string; action: string; created_at: string }[]) {
    const m = MILESTONES.find((mm) => mm.actions.includes(r.action)); if (!m) continue
    const ts = new Date(r.created_at).getTime()
    const inner = out.get(r.school_id) ?? new Map<string, number>()
    if (!inner.has(m.key) || ts < inner.get(m.key)!) inner.set(m.key, ts)
    out.set(r.school_id, inner)
  }
  return out
}

export async function loadPilotTracker(): Promise<PilotExecution> {
  const admin = createAdminClient()
  const ops = await loadPlatformOps()
  const cohort = ops.schools.filter((s) => s.isPilot)
  const ids = cohort.map((s) => s.id)

  const [times, ticketsRes] = await Promise.all([
    milestoneTimes(admin, ids),
    ids.length ? admin.from('support_tickets').select('school_id, status, category').in('school_id', ids) : Promise.resolve({ data: [] as { school_id: string; status: string; category: string | null }[] }),
  ])

  const openBySchool = new Map<string, number>()
  const feedbackBySchool = new Map<string, number>()
  for (const t of (ticketsRes.data ?? []) as { school_id: string; status: string; category: string | null }[]) {
    if (OPEN_TICKET.includes(t.status)) openBySchool.set(t.school_id, (openBySchool.get(t.school_id) ?? 0) + 1)
    if ((t.category ?? '').startsWith(FEEDBACK_PREFIX)) feedbackBySchool.set(t.school_id, (feedbackBySchool.get(t.school_id) ?? 0) + 1)
  }

  const rows: PilotTrackerRow[] = []
  for (const s of cohort) {
    const state = await getSetupState(admin, s.id)
    const stepsRemaining = state.steps.filter((st) => !st.optional && st.key !== 'review' && !st.done).map((st) => st.title)
    const mt = times.get(s.id)
    const studentTs = mt?.get('student')
    const ttvDays = studentTs !== undefined ? Math.max(0, Math.floor((studentTs - new Date(s.createdAt).getTime()) / 86_400_000)) : null
    rows.push({
      school: s, onboardingPercent: state.percent, ready: state.ready, stepsRemaining,
      milestonesReached: mt?.size ?? 0, milestonesTotal: MILESTONES.length, ttvDays,
      daysSinceActivity: s.daysSinceActivity, openTickets: openBySchool.get(s.id) ?? 0,
      feedbackCount: feedbackBySchool.get(s.id) ?? 0, featureCount: s.features.length,
    })
  }
  rows.sort((a, b) => a.onboardingPercent - b.onboardingPercent)

  const health: Record<HealthBand, number> = { healthy: 0, watch: 0, risk: 0, dormant: 0, suspended: 0 }
  for (const s of cohort) health[s.health.band]++
  const activated = cohort.filter((s) => s.activeStudents > 0).length
  const engaged7d = cohort.filter((s) => s.daysSinceActivity !== null && s.daysSinceActivity <= 7).length
  const summary: PilotSummary = {
    cohortSize: cohort.length,
    avgOnboarding: cohort.length ? Math.round(rows.reduce((a, r) => a + r.onboardingPercent, 0) / cohort.length) : 0,
    readyCount: rows.filter((r) => r.ready).length,
    activated, activationRate: cohort.length ? Math.round((activated / cohort.length) * 100) : 0,
    engaged7d, engagementRate: cohort.length ? Math.round((engaged7d / cohort.length) * 100) : 0,
    medianTtvDays: median(rows.map((r) => r.ttvDays).filter((d): d is number => d !== null)),
    avgFeatures: cohort.length ? Math.round((cohort.reduce((a, s) => a + s.features.length, 0) / cohort.length) * 10) / 10 : 0,
    featureTotal: FEATURES.length,
    openTickets: Array.from(openBySchool.values()).reduce((a, b) => a + b, 0),
    feedbackCount: Array.from(feedbackBySchool.values()).reduce((a, b) => a + b, 0),
    health,
  }
  return { cohort, rows, summary }
}

// ── Per-pilot onboarding workspace ───────────────────────────────────────────
export type WorkspaceMilestone = { key: string; label: string; reached: boolean; days: number | null }
export type PilotWorkspace = {
  school: PlatformSchool
  setup: SetupState
  milestones: WorkspaceMilestone[]
  recentActivity: { action: string; at: string }[]
  openTickets: { id: string; subject: string; status: string; priority: string; isFeedback: boolean }[]
}

export async function loadPilotWorkspace(schoolId: string): Promise<PilotWorkspace | null> {
  const admin = createAdminClient()
  const ops = await loadPlatformOps()
  const school = ops.schools.find((s) => s.id === schoolId)
  if (!school) return null

  const [setup, times, activityRes, ticketsRes] = await Promise.all([
    getSetupState(admin, schoolId),
    milestoneTimes(admin, [schoolId]),
    admin.from('audit_logs').select('action, created_at').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(12),
    admin.from('support_tickets').select('id, subject, status, priority, category').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(20),
  ])

  const mt = times.get(schoolId)
  const created = new Date(school.createdAt).getTime()
  const milestones: WorkspaceMilestone[] = MILESTONES.map((m) => {
    const ts = mt?.get(m.key)
    return { key: m.key, label: m.label, reached: ts !== undefined, days: ts !== undefined ? Math.max(0, Math.floor((ts - created) / 86_400_000)) : null }
  })
  const recentActivity = ((activityRes.data ?? []) as { action: string; created_at: string }[]).map((a) => ({ action: a.action, at: a.created_at }))
  const openTickets = ((ticketsRes.data ?? []) as { id: string; subject: string; status: string; priority: string; category: string | null }[])
    .filter((t) => OPEN_TICKET.includes(t.status))
    .map((t) => ({ id: t.id, subject: t.subject, status: t.status, priority: t.priority, isFeedback: (t.category ?? '').startsWith(FEEDBACK_PREFIX) }))

  return { school, setup, milestones, recentActivity, openTickets }
}

// ── Commercial readiness scorecard ───────────────────────────────────────────
export type ReadinessDimension = { key: string; label: string; score: number; detail: string }
export type ReadinessGate = { label: string; pass: boolean; detail: string }
export type CommercialReadiness = {
  summary: PilotSummary
  overall: number
  band: 'not_ready' | 'approaching' | 'ready'
  dimensions: ReadinessDimension[]
  gates: ReadinessGate[]
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

export async function loadCommercialReadiness(): Promise<CommercialReadiness> {
  const { rows, summary } = await loadPilotTracker()
  const n = summary.cohortSize

  // Satisfaction proxy: praise vs issue feedback across the cohort.
  const admin = createAdminClient()
  const ids = rows.map((r) => r.school.id)
  let praise = 0, issues = 0
  if (ids.length) {
    const { data } = await admin.from('support_tickets').select('category').in('school_id', ids).like('category', `${FEEDBACK_PREFIX}%`)
    for (const t of (data ?? []) as { category: string | null }[]) {
      const cat = t.category ?? ''
      if (cat === `${FEEDBACK_PREFIX}praise`) praise++
      else if (cat === `${FEEDBACK_PREFIX}bug` || cat === `${FEEDBACK_PREFIX}usability`) issues++
    }
  }
  const feedbackTotal = praise + issues
  const satisfactionScore = feedbackTotal === 0 ? 50 : clamp((praise / feedbackTotal) * 100)

  // Collection across cohort schools that have invoiced.
  const withInvoices = rows.filter((r) => r.school.collectionRate !== null)
  const avgCollection = withInvoices.length ? Math.round(withInvoices.reduce((a, r) => a + (r.school.collectionRate ?? 0), 0) / withInvoices.length) : null
  const healthyShare = n ? Math.round(((summary.health.healthy + summary.health.watch) / n) * 100) : 0
  const supportLoad = n ? summary.openTickets / n : 0

  const dimensions: ReadinessDimension[] = [
    { key: 'onboarding', label: 'Onboarding complété', score: clamp(summary.avgOnboarding), detail: `${summary.avgOnboarding}% en moyenne · ${summary.readyCount}/${n} prêtes` },
    { key: 'activation', label: 'Activation', score: clamp(summary.activationRate), detail: `${summary.activated}/${n} avec élèves actifs` },
    { key: 'engagement', label: 'Engagement (7 j)', score: clamp(summary.engagementRate), detail: `${summary.engaged7d}/${n} actives cette semaine` },
    { key: 'breadth', label: 'Étendue d’usage', score: clamp((summary.avgFeatures / Math.max(1, summary.featureTotal)) * 100), detail: `${summary.avgFeatures}/${summary.featureTotal} modules en moyenne` },
    { key: 'retention', label: 'Santé du cohort', score: clamp(healthyShare), detail: `${summary.health.healthy + summary.health.watch}/${n} saines ou à surveiller` },
    { key: 'collection', label: 'Recouvrement', score: avgCollection === null ? 50 : clamp(avgCollection), detail: avgCollection === null ? 'Pas encore de facturation' : `${avgCollection}% encaissé en moyenne` },
    { key: 'satisfaction', label: 'Satisfaction (retours)', score: satisfactionScore, detail: feedbackTotal === 0 ? 'Aucun retour qualifié' : `${praise} positif(s) · ${issues} problème(s)` },
    { key: 'support', label: 'Charge de support', score: clamp(100 - supportLoad * 25), detail: `${summary.openTickets} ticket(s) ouverts · ${supportLoad.toFixed(1)}/école` },
  ]

  // Weighted overall (activation + engagement + retention carry most signal).
  const weights: Record<string, number> = { onboarding: 1, activation: 2, engagement: 2, breadth: 1, retention: 2, collection: 1, satisfaction: 1, support: 1 }
  const totalW = dimensions.reduce((a, d) => a + (weights[d.key] ?? 1), 0)
  const overall = clamp(dimensions.reduce((a, d) => a + d.score * (weights[d.key] ?? 1), 0) / totalW)
  const band: CommercialReadiness['band'] = overall >= 70 ? 'ready' : overall >= 50 ? 'approaching' : 'not_ready'

  const gates: ReadinessGate[] = [
    { label: 'Cohorte ≥ 3 pilotes', pass: n >= 3, detail: `${n} pilote(s)` },
    { label: 'Activation ≥ 60 %', pass: summary.activationRate >= 60, detail: `${summary.activationRate}%` },
    { label: 'Onboarding moyen ≥ 80 %', pass: summary.avgOnboarding >= 80, detail: `${summary.avgOnboarding}%` },
    { label: 'Délai d’activation ≤ 14 j', pass: summary.medianTtvDays !== null && summary.medianTtvDays <= 14, detail: summary.medianTtvDays !== null ? `${summary.medianTtvDays} j` : '—' },
    { label: 'Aucune école dormante', pass: summary.health.dormant === 0, detail: `${summary.health.dormant} dormante(s)` },
    { label: 'Engagement hebdo ≥ 50 %', pass: summary.engagementRate >= 50, detail: `${summary.engagementRate}%` },
  ]

  return { summary, overall, band, dimensions, gates }
}
