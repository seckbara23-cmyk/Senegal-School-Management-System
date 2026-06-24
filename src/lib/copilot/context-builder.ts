// ─── Copilot context builder (read-only, tenant-scoped) ──────────────────────
//
// Fetches exactly the derived data an intent needs, reusing the existing libs so
// the copilot can never diverge from the dashboards. Every query is scoped to
// schoolId and runs under the admin's RLS — no cross-tenant data is reachable.

import type { createClient } from '@/lib/supabase/server'
import type { RoutedQuery } from './types'
import { loadExecutiveSnapshot, type ExecutiveSnapshot } from './executive-snapshot'
import { loadAcademicAnalytics, type AcademicAnalytics } from '@/lib/analytics/academic'
import { loadFinanceAnalytics, type FinanceAnalytics } from '@/lib/analytics/finance'
import { loadInsights, type Insights } from '@/lib/analytics/insights'
import { attendanceRate } from '@/lib/attendance'
import { loadStudentSnapshot, type StudentSnapshot } from './student-snapshot'

type Client = ReturnType<typeof createClient>

export type { StudentSnapshot }

export type CopilotContext =
  | { kind: 'school_overview'; data: ExecutiveSnapshot }
  | { kind: 'academic'; data: AcademicAnalytics }
  | { kind: 'finance'; data: FinanceAnalytics }
  | { kind: 'attendance'; data: { rate: number | null; worstClass: { name: string; rate: number } | null } }
  | { kind: 'at_risk'; data: Insights }
  | { kind: 'admissions'; data: { counts: Record<string, number>; total: number } }
  | { kind: 'transport'; data: { subscribers: number; revenue: number; routes: number; vehicles: number } }
  | { kind: 'timetable'; data: { slots: number; classesWithTimetable: number } }
  | { kind: 'homework'; data: { upcoming: number; total: number } }
  | { kind: 'student'; data: StudentSnapshot }
  | { kind: 'student_ambiguous'; data: { name: string; matches: { id: string; name: string }[] } }
  | { kind: 'student_not_found'; data: { name: string } }
  | { kind: 'help' }
  | { kind: 'unknown' }

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

async function resolveStudent(supabase: Client, schoolId: string, rawName: string): Promise<CopilotContext> {
  const tokens = norm(rawName).split(' ').filter((t) => t.length >= 2)
  if (tokens.length === 0) return { kind: 'student_not_found', data: { name: rawName } }

  const orParts = tokens.flatMap((t) => [`first_name.ilike.%${t}%`, `last_name.ilike.%${t}%`]).join(',')
  const { data } = await supabase.from('students').select('id, first_name, last_name').eq('school_id', schoolId).or(orParts).limit(20)
  const rows = (data ?? []) as { id: string; first_name: string; last_name: string }[]
  if (rows.length === 0) return { kind: 'student_not_found', data: { name: rawName } }

  const scored = rows.map((r) => {
    const hay = norm(`${r.first_name} ${r.last_name}`)
    return { r, score: tokens.filter((t) => hay.includes(t)).length }
  })
  const max = Math.max(...scored.map((s) => s.score))
  const top = scored.filter((s) => s.score === max).map((s) => s.r)

  if (top.length > 1) {
    return { kind: 'student_ambiguous', data: { name: rawName, matches: top.slice(0, 6).map((r) => ({ id: r.id, name: `${r.last_name} ${r.first_name}` })) } }
  }

  const student = top[0]
  const snapshot = await loadStudentSnapshot(supabase, schoolId, student.id, { firstName: student.first_name, lastName: student.last_name })
  return { kind: 'student', data: snapshot! }
}

export async function buildContext(supabase: Client, schoolId: string, routed: RoutedQuery): Promise<CopilotContext> {
  switch (routed.intent) {
    case 'school_overview':
      return { kind: 'school_overview', data: await loadExecutiveSnapshot(supabase, schoolId) }
    case 'academic':
      return { kind: 'academic', data: await loadAcademicAnalytics(supabase, schoolId) }
    case 'finance':
      return { kind: 'finance', data: await loadFinanceAnalytics(supabase, schoolId) }
    case 'at_risk':
      return { kind: 'at_risk', data: await loadInsights(supabase, schoolId) }
    case 'attendance': {
      const { data: yr } = await supabase.from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle()
      const yearId = (yr as { id: string } | null)?.id
      let total = 0, absent = 0
      let worstClass: { name: string; rate: number } | null = null
      if (yearId) {
        const { data } = await supabase.rpc('attendance_class_summary', { p_school_id: schoolId, p_year_id: yearId })
        for (const r of (data ?? []) as { class_name: string; class_section: string | null; present: number; absent: number; late: number; excused: number; total: number }[]) {
          total += Number(r.total); absent += Number(r.absent)
          const rate = attendanceRate({ absent: Number(r.absent), total: Number(r.total) })
          if (rate !== null && (worstClass === null || rate < worstClass.rate)) worstClass = { name: [r.class_name, r.class_section].filter(Boolean).join(' '), rate }
        }
      }
      return { kind: 'attendance', data: { rate: attendanceRate({ absent, total }), worstClass } }
    }
    case 'admissions': {
      const { data } = await supabase.from('admission_applications').select('status').eq('school_id', schoolId)
      const counts: Record<string, number> = {}
      for (const a of (data ?? []) as { status: string }[]) counts[a.status] = (counts[a.status] ?? 0) + 1
      return { kind: 'admissions', data: { counts, total: (data ?? []).length } }
    }
    case 'transport': {
      const [assignsRes, routesRes, vehiclesRes] = await Promise.all([
        supabase.from('student_transport_assignments').select('monthly_fee').eq('school_id', schoolId).eq('status', 'active'),
        supabase.from('transport_routes').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
        supabase.from('transport_vehicles').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
      ])
      const fees = ((assignsRes.data ?? []) as { monthly_fee: number }[]).map((a) => a.monthly_fee).filter((f) => f > 0)
      return { kind: 'transport', data: { subscribers: fees.length, revenue: fees.reduce((s, f) => s + f, 0), routes: routesRes.count ?? 0, vehicles: vehiclesRes.count ?? 0 } }
    }
    case 'timetable': {
      const { data } = await supabase.from('timetable_slots').select('class_id').eq('school_id', schoolId)
      const rows = (data ?? []) as { class_id: string }[]
      return { kind: 'timetable', data: { slots: rows.length, classesWithTimetable: new Set(rows.map((r) => r.class_id)).size } }
    }
    case 'homework': {
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase.from('homework').select('due_date').eq('school_id', schoolId)
      const rows = (data ?? []) as { due_date: string | null }[]
      return { kind: 'homework', data: { upcoming: rows.filter((r) => !r.due_date || r.due_date >= today).length, total: rows.length } }
    }
    case 'student_360':
      return resolveStudent(supabase, schoolId, routed.entities.studentName ?? '')
    case 'help':
      return { kind: 'help' }
    default:
      return { kind: 'unknown' }
  }
}
