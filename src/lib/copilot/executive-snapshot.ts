// ─── Executive snapshot (Context Builder layer, derived, tenant-scoped) ──────
//
// Aggregates the existing analytics + risk modules into ONE structured snapshot
// for the leadership narrative. This is the data-access layer (reuses the same
// loaders the analytics hub uses, so the executive view can never diverge from
// the dashboards). The narrative engine consumes this object and never queries.

import type { createClient as createServerClient } from '@/lib/supabase/server'
import { loadAcademicAnalytics } from '@/lib/analytics/academic'
import { loadFinanceAnalytics } from '@/lib/analytics/finance'
import { loadInsights } from '@/lib/analytics/insights'
import { loadEngagementAnalytics } from '@/lib/analytics/engagement'
import { attendanceRate } from '@/lib/attendance'

type Client = ReturnType<typeof createServerClient>

type NamedValue = { name: string; average: number } | null

export type ExecutiveSnapshot = {
  generatedAt: string
  hasData: boolean
  roster: { students: number; teachers: number; parents: number }
  academic: { average: number | null; passRate: number | null; gradedStudents: number; totalStudents: number; bestClass: NamedValue; weakClass: NamedValue; topSubject: NamedValue; weakSubject: NamedValue }
  attendance: { rate: number | null; worstClass: { name: string; rate: number } | null }
  finance: { invoiced: number; collected: number; outstanding: number; collectionRate: number; overdue: number; aging: { b1: number; b2: number; b3: number }; topDebtor: { name: string; balance: number } | null; activePlans: number }
  risk: { total: number; high: number; medium: number; factors: { academic: number; attendance: number; finance: number }; top: { name: string; level: string; average: number | null }[] }
  engagement: { parents: number; avgReadRate: number | null; engaged: number; moderate: number; low: number; responders: number }
  admissions: { total: number; pending: number }
  transport: { subscribers: number; revenue: number; routes: number; vehicles: number }
}

const PENDING_ADMISSIONS = ['submitted', 'under_review', 'documents_requested', 'waitlisted']

function bestWorst(items: { name: string; average: number | null }[]): { best: NamedValue; worst: NamedValue } {
  const graded = items.filter((i): i is { name: string; average: number } => i.average !== null)
  if (graded.length === 0) return { best: null, worst: null }
  let best = graded[0], worst = graded[0]
  for (const i of graded) { if (i.average > best.average) best = i; if (i.average < worst.average) worst = i }
  return { best: { name: best.name, average: best.average }, worst: best === worst ? null : { name: worst.name, average: worst.average } }
}

export async function loadExecutiveSnapshot(client: Client, schoolId: string): Promise<ExecutiveSnapshot> {
  const { data: yr } = await client.from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle()
  const yearId = (yr as { id: string } | null)?.id ?? null

  const [academic, finance, insights, engagement, teachersC, parentsC, attRpc, admissionsRes, staRes, routesRes, vehiclesRes] = await Promise.all([
    loadAcademicAnalytics(client, schoolId),
    loadFinanceAnalytics(client, schoolId),
    loadInsights(client, schoolId),
    loadEngagementAnalytics(client, schoolId),
    client.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
    client.from('parents').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    yearId ? client.rpc('attendance_class_summary', { p_school_id: schoolId, p_year_id: yearId }) : Promise.resolve({ data: [] as unknown[] }),
    client.from('admission_applications').select('status').eq('school_id', schoolId),
    client.from('student_transport_assignments').select('monthly_fee').eq('school_id', schoolId).eq('status', 'active'),
    client.from('transport_routes').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
    client.from('transport_vehicles').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
  ])

  // Attendance — overall rate + worst class.
  let absent = 0, total = 0
  let worstClass: { name: string; rate: number } | null = null
  for (const r of (attRpc.data ?? []) as { class_name: string; class_section: string | null; absent: number; total: number }[]) {
    absent += Number(r.absent); total += Number(r.total)
    const rate = attendanceRate({ absent: Number(r.absent), total: Number(r.total) })
    if (rate !== null && (worstClass === null || rate < worstClass.rate)) worstClass = { name: [r.class_name, r.class_section].filter(Boolean).join(' '), rate }
  }

  const classBW = bestWorst(academic.byClass.map((c) => ({ name: c.className, average: c.average })))
  const subjectBW = bestWorst(academic.bySubject.map((s) => ({ name: s.name, average: s.average })))

  const admissions = (admissionsRes.data ?? []) as { status: string }[]
  const pending = admissions.filter((a) => PENDING_ADMISSIONS.includes(a.status)).length

  const fees = ((staRes.data ?? []) as { monthly_fee: number }[]).map((a) => a.monthly_fee).filter((f) => f > 0)

  const hasData = academic.totalStudents > 0

  return {
    generatedAt: new Date().toISOString(),
    hasData,
    roster: { students: academic.totalStudents, teachers: teachersC.count ?? 0, parents: parentsC.count ?? 0 },
    academic: {
      average: academic.schoolAverage, passRate: academic.passRate, gradedStudents: academic.gradedStudents, totalStudents: academic.totalStudents,
      bestClass: classBW.best, weakClass: classBW.worst, topSubject: subjectBW.best, weakSubject: subjectBW.worst,
    },
    attendance: { rate: attendanceRate({ absent, total }), worstClass },
    finance: {
      invoiced: finance.invoiced, collected: finance.collected, outstanding: finance.outstanding, collectionRate: finance.collectionRate,
      overdue: finance.aging.b1 + finance.aging.b2 + finance.aging.b3, aging: finance.aging,
      topDebtor: finance.topDebtors[0] ? { name: finance.topDebtors[0].name, balance: finance.topDebtors[0].balance } : null,
      activePlans: finance.activePlans,
    },
    risk: {
      total: insights.summary.total, high: insights.summary.high, medium: insights.summary.medium, factors: insights.factors,
      top: insights.watch.slice(0, 3).map((w) => ({ name: `${w.lastName} ${w.firstName}`.trim(), level: w.level, average: w.average })),
    },
    engagement: {
      parents: engagement.totals.parents, avgReadRate: engagement.totals.avgReadRate,
      engaged: engagement.totals.engaged, moderate: engagement.totals.moderate, low: engagement.totals.low, responders: engagement.totals.responders,
    },
    admissions: { total: admissions.length, pending },
    transport: { subscribers: fees.length, revenue: fees.reduce((s, f) => s + f, 0), routes: routesRes.count ?? 0, vehicles: vehiclesRes.count ?? 0 },
  }
}
