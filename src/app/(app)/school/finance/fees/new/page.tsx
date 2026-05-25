import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FeeItemForm } from './_form'

export default async function NewFeePage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) redirect('/school')

  const schoolId = (membership as { school_id: string }).school_id

  const { data: yearsRaw } = await supabase
    .from('academic_years')
    .select('id, name')
    .eq('school_id', schoolId)
    .order('start_date', { ascending: false })

  const academicYears = (yearsRaw ?? []) as { id: string; name: string }[]

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/finance/fees" className="text-primary-300 hover:text-white text-sm">
            ← Tarifs &amp; Frais
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Nouveau frais</h1>
        <p className="text-primary-300 text-sm mt-0.5">
          Ajoutez un frais au catalogue pour le réutiliser dans les factures
        </p>
      </div>

      {/* ── Form card ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <FeeItemForm academicYears={academicYears} />
      </div>

    </div>
  )
}
