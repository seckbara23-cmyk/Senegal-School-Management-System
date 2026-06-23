// ─── Finance analytics (derived, never persisted) ────────────────────────────

import type { createClient as createServerClient } from '@/lib/supabase/server'

type Client = ReturnType<typeof createServerClient>

const METHOD_LABELS: Record<string, string> = { cash: 'Espèces', bank_transfer: 'Virement', cheque: 'Chèque', wave_manual: 'Wave', orange_money_manual: 'Orange Money',
  wave: 'Wave',
  orange_money: 'Orange Money', other: 'Autre' }

export type FinanceAnalytics = {
  invoiced: number; collected: number; outstanding: number; collectionRate: number
  transportRevenue: number; tuitionRevenue: number
  aging: { b1: number; b2: number; b3: number }
  methodMix: { label: string; amount: number }[]
  monthly: { label: string; amount: number }[]
  topDebtors: { studentId: string; name: string; balance: number }[]
  activePlans: number; invoiceCount: number; planAdoption: number
}

export async function loadFinanceAnalytics(client: Client, schoolId: string): Promise<FinanceAnalytics> {
  const today = new Date().toISOString().split('T')[0]
  const todayMs = new Date(today).getTime()

  const [invRes, payRes, lineRes, plansRes] = await Promise.all([
    client.from('student_invoices').select('id, student_id, total_amount, amount_paid, status, due_date').eq('school_id', schoolId).neq('status', 'cancelled'),
    client.from('student_payments').select('amount, payment_method, paid_at').eq('school_id', schoolId),
    client.from('invoice_lines').select('amount, source').eq('school_id', schoolId),
    client.from('payment_plans').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
  ])

  const invoices = (invRes.data ?? []) as { id: string; student_id: string; total_amount: number; amount_paid: number; status: string; due_date: string | null }[]
  const invoiced = invoices.reduce((s, i) => s + i.total_amount, 0)
  const collected = invoices.reduce((s, i) => s + i.amount_paid, 0)
  const outstanding = invoiced - collected

  // Aging + per-student balance.
  const aging = { b1: 0, b2: 0, b3: 0 }
  const balByStudent = new Map<string, number>()
  for (const i of invoices) {
    const bal = i.total_amount - i.amount_paid
    if (bal > 0) balByStudent.set(i.student_id, (balByStudent.get(i.student_id) ?? 0) + bal)
    if ((i.status === 'unpaid' || i.status === 'partial') && i.due_date && i.due_date < today) {
      const days = Math.floor((todayMs - new Date(i.due_date).getTime()) / 86_400_000)
      if (days <= 30) aging.b1 += bal; else if (days <= 60) aging.b2 += bal; else aging.b3 += bal
    }
  }

  // Revenue by source.
  const lines = (lineRes.data ?? []) as { amount: number; source: string | null }[]
  const transportRevenue = lines.filter((l) => l.source === 'transport').reduce((s, l) => s + l.amount, 0)
  const tuitionRevenue = Math.max(0, invoiced - transportRevenue)

  // Method mix + monthly trend.
  const payments = (payRes.data ?? []) as { amount: number; payment_method: string; paid_at: string }[]
  const methodMap = new Map<string, number>()
  for (const p of payments) methodMap.set(p.payment_method, (methodMap.get(p.payment_method) ?? 0) + p.amount)
  const methodMix = Array.from(methodMap.entries()).map(([m, amt]) => ({ label: METHOD_LABELS[m] ?? m, amount: amt })).sort((a, b) => b.amount - a.amount)

  // Last 6 months (including current), oldest → newest.
  const now = new Date()
  const months: { ym: string; label: string; amount: number }[] = []
  for (let k = 5; k >= 0; k--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1))
    months.push({ ym: d.toISOString().slice(0, 7), label: d.toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' }), amount: 0 })
  }
  const monthIndex = new Map(months.map((m, i) => [m.ym, i]))
  for (const p of payments) {
    const ym = p.paid_at.slice(0, 7)
    const idx = monthIndex.get(ym)
    if (idx !== undefined) months[idx].amount += p.amount
  }

  // Top debtors (names resolved).
  const debtorEntries = Array.from(balByStudent.entries()).filter(([, b]) => b > 0).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const debtorIds = debtorEntries.map(([id]) => id)
  const nameById = new Map<string, string>()
  if (debtorIds.length > 0) {
    const { data: studs } = await client.from('students').select('id, first_name, last_name').eq('school_id', schoolId).in('id', debtorIds)
    for (const s of (studs ?? []) as { id: string; first_name: string; last_name: string }[]) nameById.set(s.id, `${s.last_name} ${s.first_name}`)
  }
  const topDebtors = debtorEntries.map(([studentId, balance]) => ({ studentId, name: nameById.get(studentId) ?? '—', balance }))

  const activePlans = plansRes.count ?? 0
  return {
    invoiced, collected, outstanding,
    collectionRate: invoiced > 0 ? Math.round((collected / invoiced) * 100) : 0,
    transportRevenue, tuitionRevenue, aging, methodMix,
    monthly: months.map((m) => ({ label: m.label, amount: m.amount })),
    topDebtors, activePlans, invoiceCount: invoices.length,
    planAdoption: invoices.length > 0 ? Math.round((activePlans / invoices.length) * 100) : 0,
  }
}
