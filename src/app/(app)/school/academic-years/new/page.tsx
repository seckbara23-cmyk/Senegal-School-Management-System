import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import { AcademicYearCreateForm } from './_form'

export default async function NewAcademicYearPage() {
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

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/academic-years" className="text-primary-300 hover:text-white text-sm transition-colors">
            ← Années scolaires
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Nouvelle année scolaire
        </h1>
        <p className="mt-0.5 text-sm text-primary-300">
          Définissez le nom, les dates et le statut de l&apos;année.
        </p>
      </div>

      {/* ── Form card ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <AcademicYearCreateForm />
      </div>

    </div>
  )
}
