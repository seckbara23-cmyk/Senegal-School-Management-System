// ─── Student snapshot loader (Context Builder output, tenant-scoped) ──────────
//
// The single source of the "Student 360" snapshot consumed by the narrative
// engine. Reuses the derived risk engine + outstanding balance, scoped to the
// school and run under the caller's RLS. This is DATA LOADING (the Context
// Builder layer) — the narrative engine itself never touches the database.

import type { createClient } from '@/lib/supabase/server'
import { loadSchoolRisk, type StudentRisk } from '@/lib/academic/risk-data'

type Client = ReturnType<typeof createClient>

export type StudentSnapshot = StudentRisk & { outstanding: number }

export async function loadStudentSnapshot(
  supabase: Client,
  schoolId: string,
  studentId: string,
  fallback?: { firstName: string; lastName: string; className?: string },
): Promise<StudentSnapshot | null> {
  const risk = (await loadSchoolRisk(supabase, schoolId, { studentId })).results[0]

  const { data: invs } = await supabase
    .from('student_invoices').select('total_amount, amount_paid, status')
    .eq('school_id', schoolId).eq('student_id', studentId).in('status', ['unpaid', 'partial'])
  const outstanding = ((invs ?? []) as { total_amount: number; amount_paid: number }[]).reduce((s, i) => s + (i.total_amount - i.amount_paid), 0)

  if (risk) return { ...risk, outstanding }
  if (fallback) {
    return {
      studentId, firstName: fallback.firstName, lastName: fallback.lastName,
      classId: '', className: fallback.className ?? '—', average: null,
      level: 'low', score: 0, reasons: [], actions: [], outstanding,
    }
  }
  return null
}
