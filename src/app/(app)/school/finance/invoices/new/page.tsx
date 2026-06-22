import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InvoiceForm } from './_form'

export default async function NewInvoicePage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/school')

  const schoolId = (membership as { school_id: string }).school_id

  const [studentsRes, feeItemsRes, yearsRes] = await Promise.all([
    supabase
      .from('students')
      .select('id, first_name, last_name')
      .eq('school_id', schoolId)
      .order('last_name')
      .order('first_name'),

    supabase
      .from('fee_items')
      .select('id, name, amount, description')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('name'),

    supabase
      .from('academic_years')
      .select('id, name')
      .eq('school_id', schoolId)
      .order('starts_on', { ascending: false }),
  ])

  const students     = (studentsRes.data  ?? []) as { id: string; first_name: string; last_name: string }[]
  const feeItems     = (feeItemsRes.data  ?? []) as { id: string; name: string; amount: number; description: string | null }[]
  const academicYears = (yearsRes.data    ?? []) as { id: string; name: string }[]

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/finance/invoices" className="text-primary-300 hover:text-white text-sm">
            ← Factures
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Nouvelle facture</h1>
        <p className="text-primary-300 text-sm mt-0.5">
          Créez une facture pour un élève et sélectionnez les frais applicables
        </p>
      </div>

      {/* ── Form card ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <InvoiceForm
          students={students}
          feeItems={feeItems}
          academicYears={academicYears}
        />
      </div>

    </div>
  )
}
