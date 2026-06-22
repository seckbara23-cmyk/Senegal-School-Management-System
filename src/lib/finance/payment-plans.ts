// ─── Payment plan helpers (pure) ─────────────────────────────────────────────
//
// A plan splits ONE invoice's total into a due-dated installment schedule. The
// invoice stays the source of truth for amount_paid; per-installment "paid" is
// DERIVED here by FIFO-allocating amount_paid across installments by sequence.

export type PlannedInstallment = { sequence: number; amount: number; due_date: string }

function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map((n) => parseInt(n, 10))
  const dt = new Date(Date.UTC(y, (m - 1) + months, d))
  return dt.toISOString().slice(0, 10)
}

// Split `total` into `count` installments. The base is floor(total/count); the
// final installment absorbs the rounding remainder so the sum equals total.
export function splitInstallments(total: number, count: number, startDate: string, intervalMonths = 1): PlannedInstallment[] {
  const base = Math.floor(total / count)
  const remainder = total - base * count
  const out: PlannedInstallment[] = []
  for (let i = 0; i < count; i++) {
    out.push({
      sequence: i + 1,
      amount: base + (i === count - 1 ? remainder : 0),
      due_date: addMonths(startDate, i * intervalMonths),
    })
  }
  return out
}

export type InstallmentStatus = 'paid' | 'partial' | 'pending'
export type DerivedInstallment = {
  sequence: number
  amount: number
  due_date: string | null
  allocated: number
  remaining: number
  status: InstallmentStatus
  overdue: boolean
}

// Derive each installment's settlement state from the invoice's amount_paid.
// `installments` must be ordered by sequence ascending.
export function deriveInstallments(
  installments: { sequence: number; amount: number; due_date: string | null }[],
  amountPaid: number,
  today: string,
): DerivedInstallment[] {
  let remainingPaid = Math.max(0, amountPaid)
  return installments.map((inst) => {
    const allocated = Math.max(0, Math.min(inst.amount, remainingPaid))
    remainingPaid -= allocated
    const status: InstallmentStatus = allocated >= inst.amount ? 'paid' : allocated > 0 ? 'partial' : 'pending'
    const overdue = status !== 'paid' && !!inst.due_date && inst.due_date < today
    return { ...inst, allocated, remaining: inst.amount - allocated, status, overdue }
  })
}

export const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = {
  paid: 'Réglée', partial: 'Partielle', pending: 'À venir',
}
