import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import { CreateTeacherForm } from './_form'

export default async function NewTeacherPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminMembership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()

  if (!adminMembership) redirect('/school')

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/teachers" className="text-primary-300 hover:text-white text-sm">
            ← Enseignants
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Nouvel enseignant</h1>
        <p className="mt-0.5 text-sm text-primary-300">
          Création d&apos;un dossier enseignant dans l&apos;établissement
        </p>
      </div>

      {/* ── Form card ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <CreateTeacherForm />
      </div>

    </div>
  )
}
