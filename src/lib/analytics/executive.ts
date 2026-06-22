// ─── Executive analytics (derived, never persisted) ──────────────────────────
//
// Composes top-line KPIs across the four domains for the analytics hub. Reuses
// the risk engine for academic + at-risk figures and the 041 attendance RPC for
// the school-wide rate. Tenant-scoped; read-only.

import type { createClient as createServerClient } from '@/lib/supabase/server'
import { loadSchoolRisk } from '@/lib/academic/risk-data'
import { attendanceRate } from '@/lib/attendance'

type Client = ReturnType<typeof createServerClient>

export type ExecutiveSummary = {
  students: number
  teachers: number
  parents: number
  attendanceRate: number | null
  collectionRate: number
  outstanding: number
  academicAverage: number | null
  passRate: number | null
  gradedStudents: number
  atRisk: { total: number; high: number; medium: number }
}

export async function loadExecutiveSummary(client: Client, schoolId: string): Promise<ExecutiveSummary> {
  const { data: yr } = await client.from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle()
  const yearId = (yr as { id: string } | null)?.id ?? null

  const [studentsC, teachersC, parentsC, risk, attRows, invoicesRes] = await Promise.all([
    client.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    client.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
    client.from('parents').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    loadSchoolRisk(client, schoolId),
    yearId ? client.rpc('attendance_class_summary', { p_school_id: schoolId, p_year_id: yearId }) : Promise.resolve({ data: [] as unknown[] }),
    client.from('student_invoices').select('total_amount, amount_paid').eq('school_id', schoolId).neq('status', 'cancelled'),
  ])

  let absent = 0, total = 0
  for (const r of (attRows.data ?? []) as { absent: number; total: number }[]) { absent += Number(r.absent); total += Number(r.total) }

  const invoices = (invoicesRes.data ?? []) as { total_amount: number; amount_paid: number }[]
  const invoiced = invoices.reduce((s, i) => s + i.total_amount, 0)
  const collected = invoices.reduce((s, i) => s + i.amount_paid, 0)

  const graded = risk.results.filter((r) => r.average !== null)
  const academicAverage = graded.length ? Math.round((graded.reduce((s, r) => s + (r.average as number), 0) / graded.length) * 100) / 100 : null
  const passRate = graded.length ? Math.round((graded.filter((r) => (r.average as number) >= 10).length / graded.length) * 100) : null

  return {
    students: studentsC.count ?? 0,
    teachers: teachersC.count ?? 0,
    parents: parentsC.count ?? 0,
    attendanceRate: attendanceRate({ absent, total }),
    collectionRate: invoiced > 0 ? Math.round((collected / invoiced) * 100) : 0,
    outstanding: invoiced - collected,
    academicAverage, passRate, gradedStudents: graded.length,
    atRisk: risk.summary,
  }
}
