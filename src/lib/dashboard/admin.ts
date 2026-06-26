// ─── Admin dashboard data (Phase 11C — derived, read-only, tenant-scoped) ─────
//
// One bounded loader that derives EVERY dashboard widget's data from existing
// tables under the caller's RLS. Reuses the risk engine + computeHealth + audit
// labels. No new tables, no writes, no business-logic change — pure read model.

import type { createClient } from '@/lib/supabase/server'
import { loadSchoolRisk } from '@/lib/academic/risk-data'
import { computeHealth, type HealthBand } from '@/lib/platform/health'
import { actionLabel } from '@/lib/audit-labels'

type Client = ReturnType<typeof createClient>

export type KpiSeries = { total: number; newThisWeek: number; spark: number[]; deltaPct: number | null }
export type DashAlert = { key: string; label: string; count: number; href: string; tone: 'red' | 'amber' | 'sky' | 'emerald' | 'primary'; icon: string }
export type TimelineItem = { time: string; label: string }
export type ActivityItem = { label: string; at: string; actor: string | null }
export type HealthDim = { label: string; dir: 'up' | 'down'; good: boolean }

export type AdminDashboard = {
  kpis: {
    students: KpiSeries; teachers: KpiSeries; parents: KpiSeries; classes: KpiSeries; admissions: KpiSeries
    attendanceRate: number | null; attendanceSpark: number[]; attendanceDeltaPct: number | null
    revenue30: number; revenueSpark: number[]; revenueDeltaPct: number | null
    risk: { total: number; high: number; medium: number; low: number }
  }
  outstanding: number
  alerts: DashAlert[]
  timeline: TimelineItem[]
  activity: ActivityItem[]
  health: { score: number; band: HealthBand; dims: HealthDim[] }
  brief: { lead: string; bullets: string[] }
}

const WEEKS = 6
const DAY = 86_400_000
const round = (n: number) => Math.round(n)

function deltaPct(now: number, prev: number): number | null {
  if (prev > 0) return round(((now - prev) / prev) * 100)
  return now > 0 ? 100 : null
}

// Generic count + 6-week cumulative spark from a table's created_at.
async function series(supabase: Client, table: string, schoolId: string, since42: string): Promise<KpiSeries> {
  const [totalRes, recentRes] = await Promise.all([
    supabase.from(table).select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from(table).select('created_at').eq('school_id', schoolId).gte('created_at', since42),
  ])
  const total = totalRes.count ?? 0
  const rows = (recentRes.data ?? []) as { created_at: string }[]
  const now = Date.now()
  const buckets = new Array(WEEKS).fill(0) as number[]
  for (const r of rows) {
    const wk = WEEKS - 1 - Math.floor((now - new Date(r.created_at).getTime()) / (7 * DAY))
    if (wk >= 0 && wk < WEEKS) buckets[wk]++
  }
  const baseline = Math.max(0, total - buckets.reduce((a, b) => a + b, 0))
  const spark: number[] = []
  let run = baseline
  for (let i = 0; i < WEEKS; i++) { run += buckets[i]; spark.push(run) }
  return { total, newThisWeek: buckets[WEEKS - 1], spark, deltaPct: deltaPct(buckets[WEEKS - 1], buckets[WEEKS - 2]) }
}

export async function loadAdminDashboard(supabase: Client, schoolId: string, userId: string, subscriptionStatus: string): Promise<AdminDashboard> {
  const now = Date.now()
  const todayDate = new Date().toISOString().slice(0, 10)
  const startOfToday = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'
  const since42 = new Date(now - 42 * DAY).toISOString()
  const since42Date = new Date(now - 42 * DAY).toISOString().slice(0, 10)

  const { data: yr } = await supabase.from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle()
  const yearId = (yr as { id: string } | null)?.id ?? null

  const [
    students, teachers, parents, classes, admissions,
    invRes, payRes, sessRes, risk, auditRes,
    overdueRes, bulletinRes, admReviewRes, examRes, todaySessRes, classesTodayRes,
  ] = await Promise.all([
    series(supabase, 'students', schoolId, since42),
    series(supabase, 'teachers', schoolId, since42),
    series(supabase, 'parents', schoolId, since42),
    series(supabase, 'classes', schoolId, since42),
    series(supabase, 'admission_applications', schoolId, since42),
    supabase.from('student_invoices').select('total_amount, amount_paid, status, due_date').eq('school_id', schoolId).neq('status', 'cancelled'),
    supabase.from('student_payments').select('amount, paid_at').eq('school_id', schoolId).gte('paid_at', since42),
    supabase.from('attendance_sessions').select('id, session_date').eq('school_id', schoolId).gte('session_date', since42Date),
    loadSchoolRisk(supabase, schoolId),
    supabase.from('audit_logs').select('action, created_at, actor_email').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(40),
    supabase.from('student_invoices').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).in('status', ['unpaid', 'partial']).lt('due_date', todayDate).not('due_date', 'is', null),
    supabase.from('bulletin_comments').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).is('approved_at', null),
    supabase.from('admission_applications').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).in('status', ['submitted', 'under_review']),
    supabase.from('exam_sessions').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active').lte('starts_on', todayDate).gte('ends_on', todayDate),
    supabase.from('attendance_sessions').select('class_id').eq('school_id', schoolId).eq('session_date', todayDate),
    yearId ? supabase.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('academic_year_id', yearId) : supabase.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
  ])

  // ── Finance: outstanding + collection rate. ──────────────────────────────────
  const inv = (invRes.data ?? []) as { total_amount: number; amount_paid: number; status: string; due_date: string | null }[]
  const invoiced = inv.reduce((s, i) => s + i.total_amount, 0)
  const collected = inv.reduce((s, i) => s + i.amount_paid, 0)
  const outstanding = inv.filter((i) => i.status === 'unpaid' || i.status === 'partial').reduce((s, i) => s + (i.total_amount - i.amount_paid), 0)
  const collectionRate = invoiced > 0 ? round((collected / invoiced) * 100) : null

  // ── Revenue: weekly spark + last-30-day total. ───────────────────────────────
  const pays = (payRes.data ?? []) as { amount: number; paid_at: string }[]
  const revBuckets = new Array(WEEKS).fill(0) as number[]
  let revenue30 = 0
  for (const p of pays) {
    const age = now - new Date(p.paid_at).getTime()
    if (age <= 30 * DAY) revenue30 += p.amount
    const wk = WEEKS - 1 - Math.floor(age / (7 * DAY))
    if (wk >= 0 && wk < WEEKS) revBuckets[wk] += p.amount
  }
  const revenueDeltaPct = deltaPct(revBuckets[WEEKS - 1], revBuckets[WEEKS - 2])

  // ── Attendance: weekly rate spark + 30-day rate. ─────────────────────────────
  const sessions = (sessRes.data ?? []) as { id: string; session_date: string }[]
  const sessWeek = new Map<string, number>()
  for (const s of sessions) {
    const wk = WEEKS - 1 - Math.floor((now - new Date(s.session_date).getTime()) / (7 * DAY))
    if (wk >= 0 && wk < WEEKS) sessWeek.set(s.id, wk)
  }
  const sess30 = new Set(sessions.filter((s) => now - new Date(s.session_date).getTime() <= 30 * DAY).map((s) => s.id))
  let attendanceRate: number | null = null
  let attendanceSpark: number[] = []
  let attendanceDeltaPct: number | null = null
  if (sessions.length > 0) {
    const { data: recs } = await supabase.from('attendance_records').select('status, session_id').eq('school_id', schoolId).in('session_id', sessions.map((s) => s.id))
    const wkTotal = new Array(WEEKS).fill(0) as number[]
    const wkPresent = new Array(WEEKS).fill(0) as number[]
    let t30 = 0, a30 = 0
    for (const r of (recs ?? []) as { status: string; session_id: string }[]) {
      if (sess30.has(r.session_id)) { t30++; if (r.status === 'absent') a30++ }
      const wk = sessWeek.get(r.session_id); if (wk === undefined) continue
      wkTotal[wk]++; if (r.status !== 'absent') wkPresent[wk]++
    }
    attendanceRate = t30 > 0 ? round(((t30 - a30) / t30) * 100) : null
    let carry = attendanceRate ?? 0
    attendanceSpark = wkTotal.map((tot, i) => { if (tot > 0) carry = round((wkPresent[i] / tot) * 100); return carry })
    const rW = wkTotal[WEEKS - 1] > 0 ? (wkPresent[WEEKS - 1] / wkTotal[WEEKS - 1]) * 100 : null
    const rP = wkTotal[WEEKS - 2] > 0 ? (wkPresent[WEEKS - 2] / wkTotal[WEEKS - 2]) * 100 : null
    attendanceDeltaPct = rW !== null && rP !== null ? round(rW - rP) : null
  }

  // ── Risk distribution. ───────────────────────────────────────────────────────
  const riskDist = { total: risk.summary.total, high: risk.summary.high, medium: risk.summary.medium, low: risk.results.length - risk.summary.total }

  // ── Alerts (only actionable, count > 0). ─────────────────────────────────────
  const todaySessClasses = new Set(((todaySessRes.data ?? []) as { class_id: string }[]).map((s) => s.class_id))
  const pendingAttendance = Math.max(0, (classesTodayRes.count ?? 0) - todaySessClasses.size)
  const rawAlerts: DashAlert[] = [
    { key: 'overdue', label: 'paiements en retard', count: overdueRes.count ?? 0, href: '/school/finance/invoices', tone: 'red', icon: 'money' },
    { key: 'risk', label: 'élèves à risque élevé', count: riskDist.high, href: '/school/academic-support', tone: 'red', icon: 'alert' },
    { key: 'bulletins', label: 'bulletins à publier', count: bulletinRes.count ?? 0, href: '/school/academics/bulletins', tone: 'amber', icon: 'document' },
    { key: 'admissions', label: 'admissions à examiner', count: admReviewRes.count ?? 0, href: '/school/admissions', tone: 'sky', icon: 'inbox' },
    { key: 'exams', label: 'examens aujourd’hui', count: examRes.count ?? 0, href: '/school/exams', tone: 'primary', icon: 'academic' },
    { key: 'attendance', label: 'présences non saisies', count: pendingAttendance, href: '/school/attendance', tone: 'amber', icon: 'clock' },
  ]
  const alerts = rawAlerts.filter((a) => a.count > 0)

  // ── Timeline (today) + activity feed (recent) from audit logs. ───────────────
  const audit = (auditRes.data ?? []) as { action: string; created_at: string; actor_email: string | null }[]
  const timeline: TimelineItem[] = audit
    .filter((a) => a.created_at >= startOfToday)
    .slice(0, 8)
    .map((a) => ({ time: new Date(a.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), label: actionLabel(a.action) }))
  const activity: ActivityItem[] = audit.slice(0, 8).map((a) => ({ label: actionLabel(a.action), at: a.created_at, actor: a.actor_email }))

  // ── Health (computeHealth) + directional sub-dimensions. ─────────────────────
  const lastIso = audit[0]?.created_at ?? null
  const daysSinceActivity = lastIso ? Math.floor((now - new Date(lastIso).getTime()) / DAY) : null
  const health = computeHealth({ subscriptionStatus, billingStatus: null, daysSinceActivity, collectionRate, activeStudents: students.total })
  const finOk = collectionRate !== null && collectionRate >= 80
  const attOk = attendanceRate !== null && attendanceRate >= 90
  const dims: HealthDim[] = [
    { label: 'Académique', dir: riskDist.high === 0 ? 'up' : 'down', good: riskDist.high === 0 },
    { label: 'Finances', dir: finOk ? 'up' : 'down', good: finOk },
    { label: 'Présences', dir: attOk ? 'up' : 'down', good: attOk },
    { label: 'Risques', dir: riskDist.high === 0 ? 'down' : 'up', good: riskDist.high === 0 },
  ]

  // ── AI daily brief (deterministic — future LLM provider replaces this). ──────
  const bullets: string[] = []
  if ((overdueRes.count ?? 0) > 0) bullets.push(`${overdueRes.count} paiement(s) en retard à relancer`)
  if ((bulletinRes.count ?? 0) > 0) bullets.push(`${bulletinRes.count} bulletin(s) à publier`)
  if (riskDist.high > 0) bullets.push(`${riskDist.high} élève(s) à risque élevé à suivre`)
  if ((admReviewRes.count ?? 0) > 0) bullets.push(`${admReviewRes.count} candidature(s) à examiner`)
  if ((examRes.count ?? 0) > 0) bullets.push(`${examRes.count} session(s) d’examen aujourd’hui`)
  if (pendingAttendance > 0) bullets.push(`${pendingAttendance} classe(s) sans présence aujourd’hui`)
  if (bullets.length === 0) bullets.push('Aucune action urgente — tout est à jour. 🎉')
  const brief = { lead: 'Voici vos priorités aujourd’hui :', bullets: bullets.slice(0, 4) }

  return {
    kpis: {
      students, teachers, parents, classes, admissions,
      attendanceRate, attendanceSpark, attendanceDeltaPct,
      revenue30, revenueSpark: revBuckets, revenueDeltaPct,
      risk: riskDist,
    },
    outstanding, alerts, timeline, activity,
    health: { score: health.score, band: health.band, dims },
    brief,
  }
}
