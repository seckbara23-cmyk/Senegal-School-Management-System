// ─── Pilot success dashboard (derived, super-admin) ──────────────────────────
//
// Cohort = schools.is_pilot. Funnel from getSetupState per pilot; time-to-value
// milestones from the EARLIEST audit_logs row of each milestone action per
// school. Point-in-time derived — no snapshot table.

import { createAdminClient } from '@/lib/supabase/admin'
import { getSetupState } from '@/lib/setup'
import { loadPlatformOps, type PlatformSchool } from './ops'
import type { HealthBand } from './health'

const MILESTONES: { key: string; label: string; actions: string[] }[] = [
  { key: 'student', label: '1er élève', actions: ['student_created', 'students_bulk_created'] },
  { key: 'attendance', label: '1re présence', actions: ['teacher_attendance_records_saved', 'admin_attendance_records_saved'] },
  { key: 'grade', label: '1re note', actions: ['teacher_grades_saved', 'grades_saved'] },
  { key: 'invoice', label: '1re facture', actions: ['invoice_created', 'bulk_invoices_created'] },
  { key: 'message', label: '1er message parent', actions: ['message_sent'] },
  { key: 'online_pay', label: '1er paiement en ligne', actions: ['online_payment_reconciled'] },
]

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

export type PilotDashboard = {
  cohort: PlatformSchool[]
  setupBySchool: Record<string, number>   // schoolId → onboarding percent
  activated: number
  activationRate: number
  medianActivationDays: number | null
  funnel: { key: string; label: string; reached: number }[]
  milestones: { key: string; label: string; medianDays: number | null; count: number }[]
  health: Record<HealthBand, number>
  adoption: { key: string; label: string; count: number; rate: number }[]
  nonPilots: { id: string; name: string }[]
}

export async function loadPilotDashboard(): Promise<PilotDashboard> {
  const admin = createAdminClient()
  const ops = await loadPlatformOps()
  const cohort = ops.schools.filter((s) => s.isPilot)
  const cohortIds = cohort.map((s) => s.id)
  const createdById = new Map(cohort.map((s) => [s.id, new Date(s.createdAt).getTime()]))

  // Onboarding funnel (per-pilot getSetupState — few schools).
  const setupBySchool: Record<string, number> = {}
  const funnelReached: Record<string, number> = {}
  let funnelOrder: { key: string; label: string }[] = []
  for (const s of cohort) {
    const state = await getSetupState(admin, s.id)
    setupBySchool[s.id] = state.percent
    const required = state.steps.filter((st) => !st.optional && st.key !== 'review')
    if (funnelOrder.length === 0) funnelOrder = required.map((st) => ({ key: st.key, label: st.title }))
    for (const st of required) if (st.done) funnelReached[st.key] = (funnelReached[st.key] ?? 0) + 1
  }
  const funnel = funnelOrder.map((f) => ({ key: f.key, label: f.label, reached: funnelReached[f.key] ?? 0 }))

  // Milestones from earliest audit_logs per school.
  const milestoneDays: Record<string, number[]> = {}
  if (cohortIds.length > 0) {
    const allActions = MILESTONES.flatMap((m) => m.actions)
    const { data } = await admin.from('audit_logs').select('school_id, action, created_at').in('school_id', cohortIds).in('action', allActions)
    const earliest = new Map<string, number>() // `${schoolId}|${milestoneKey}` → ts
    for (const r of (data ?? []) as { school_id: string; action: string; created_at: string }[]) {
      const m = MILESTONES.find((mm) => mm.actions.includes(r.action)); if (!m) continue
      const key = `${r.school_id}|${m.key}`; const ts = new Date(r.created_at).getTime()
      if (!earliest.has(key) || ts < earliest.get(key)!) earliest.set(key, ts)
    }
    earliest.forEach((ts, key) => {
      const [schoolId, mKey] = key.split('|')
      const created = createdById.get(schoolId); if (created === undefined) return
      const days = Math.max(0, Math.floor((ts - created) / 86_400_000))
      ;(milestoneDays[mKey] ??= []).push(days)
    })
  }
  const milestones = MILESTONES.map((m) => ({ key: m.key, label: m.label, medianDays: median(milestoneDays[m.key] ?? []), count: (milestoneDays[m.key] ?? []).length }))

  const activated = cohort.filter((s) => s.activeStudents > 0).length
  const health: Record<HealthBand, number> = { healthy: 0, watch: 0, risk: 0, dormant: 0, suspended: 0 }
  for (const s of cohort) health[s.health.band]++

  const adoption = ops.adoption.map((a) => {
    const count = cohort.filter((s) => s.features.includes(a.key)).length
    return { key: a.key, label: a.label, count, rate: cohort.length > 0 ? Math.round((count / cohort.length) * 100) : 0 }
  })

  const nonPilots = ops.schools.filter((s) => !s.isPilot && s.subscriptionStatus !== 'archived').map((s) => ({ id: s.id, name: s.name }))

  return {
    cohort, setupBySchool, activated,
    activationRate: cohort.length > 0 ? Math.round((activated / cohort.length) * 100) : 0,
    medianActivationDays: median(milestoneDays['student'] ?? []),
    funnel, milestones, health, adoption, nonPilots,
  }
}
