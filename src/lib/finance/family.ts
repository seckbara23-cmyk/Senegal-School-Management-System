// ─── Family billing helpers ──────────────────────────────────────────────────
//
// A "family" is a parent and their linked children (parent_student_links). No
// household table — billing stays per-student; this only aggregates for reading
// and family-wide invoicing. Tenant-scoped (caller passes schoolId).

import type { createClient as createServerClient } from '@/lib/supabase/server'

type Client = ReturnType<typeof createServerClient>

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export type FamilySummary = { parentId: string; parentName: string; childCount: number; outstanding: number }

export async function loadFamilies(client: Client, schoolId: string): Promise<FamilySummary[]> {
  const [{ data: links }, { data: parents }, { data: invoices }] = await Promise.all([
    client.from('parent_student_links').select('parent_id, student_id').eq('school_id', schoolId),
    client.from('parents').select('id, first_name, last_name').eq('school_id', schoolId),
    client.from('student_invoices').select('student_id, total_amount, amount_paid').eq('school_id', schoolId).in('status', ['unpaid', 'partial']),
  ])

  const balanceByStudent = new Map<string, number>()
  for (const inv of (invoices ?? []) as { student_id: string; total_amount: number; amount_paid: number }[]) {
    balanceByStudent.set(inv.student_id, (balanceByStudent.get(inv.student_id) ?? 0) + (inv.total_amount - inv.amount_paid))
  }

  const childrenByParent = new Map<string, Set<string>>()
  for (const l of (links ?? []) as { parent_id: string; student_id: string }[]) {
    const set = childrenByParent.get(l.parent_id) ?? new Set<string>(); set.add(l.student_id); childrenByParent.set(l.parent_id, set)
  }

  const out: FamilySummary[] = []
  for (const p of (parents ?? []) as { id: string; first_name: string; last_name: string }[]) {
    const kids = childrenByParent.get(p.id)
    if (!kids || kids.size === 0) continue
    let outstanding = 0
    kids.forEach((sid) => { outstanding += balanceByStudent.get(sid) ?? 0 })
    out.push({ parentId: p.id, parentName: `${p.last_name} ${p.first_name}`, childCount: kids.size, outstanding })
  }
  out.sort((a, b) => b.outstanding - a.outstanding || a.parentName.localeCompare(b.parentName))
  return out
}

export type FamilyChild = { studentId: string; name: string; outstanding: number; invoiceCount: number; total: number; paid: number }
export type FamilyDetail = { parentId: string; parentName: string; children: FamilyChild[]; totalOutstanding: number; totalBilled: number; totalPaid: number }

export async function loadFamily(client: Client, schoolId: string, parentId: string): Promise<FamilyDetail | null> {
  const { data: parent } = await client.from('parents').select('id, first_name, last_name').eq('id', parentId).eq('school_id', schoolId).maybeSingle()
  if (!parent) return null
  const p = parent as { id: string; first_name: string; last_name: string }

  const { data: links } = await client
    .from('parent_student_links').select('students!student_id(id, first_name, last_name)').eq('school_id', schoolId).eq('parent_id', parentId)
  type Child = { id: string; first_name: string; last_name: string }
  const students = ((links ?? []) as unknown as { students: Child | null }[]).map((l) => one<Child>(l.students)).filter((c): c is Child => !!c)
  const studentIds = students.map((s) => s.id)

  const byStudent = new Map<string, { outstanding: number; count: number; total: number; paid: number }>()
  if (studentIds.length > 0) {
    const { data: invoices } = await client
      .from('student_invoices').select('student_id, total_amount, amount_paid, status').eq('school_id', schoolId).in('student_id', studentIds)
    for (const inv of (invoices ?? []) as { student_id: string; total_amount: number; amount_paid: number; status: string }[]) {
      const cur = byStudent.get(inv.student_id) ?? { outstanding: 0, count: 0, total: 0, paid: 0 }
      cur.count++
      if (inv.status !== 'cancelled') {
        cur.total += inv.total_amount; cur.paid += inv.amount_paid
        if (inv.status === 'unpaid' || inv.status === 'partial') cur.outstanding += inv.total_amount - inv.amount_paid
      }
      byStudent.set(inv.student_id, cur)
    }
  }

  const children: FamilyChild[] = students.map((s) => {
    const agg = byStudent.get(s.id) ?? { outstanding: 0, count: 0, total: 0, paid: 0 }
    return { studentId: s.id, name: `${s.last_name} ${s.first_name}`, outstanding: agg.outstanding, invoiceCount: agg.count, total: agg.total, paid: agg.paid }
  }).sort((a, b) => a.name.localeCompare(b.name))

  return {
    parentId: p.id, parentName: `${p.last_name} ${p.first_name}`, children,
    totalOutstanding: children.reduce((s, c) => s + c.outstanding, 0),
    totalBilled: children.reduce((s, c) => s + c.total, 0),
    totalPaid: children.reduce((s, c) => s + c.paid, 0),
  }
}
