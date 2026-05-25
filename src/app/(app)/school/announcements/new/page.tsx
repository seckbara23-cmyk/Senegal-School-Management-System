import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AnnouncementForm, type ClassOption } from './_form'

export default async function NewAnnouncementPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('school_id, schools(id, name)')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')

  if (!memberships || memberships.length === 0) redirect('/dashboard')

  const school = memberships[0].schools as unknown as { id: string; name: string }

  const { data: rawClasses } = await supabase
    .from('classes')
    .select('id, name, section, academic_years!academic_year_id(name)')
    .eq('school_id', school.id)
    .order('name')

  const classes = (rawClasses ?? []) as unknown as ClassOption[]

  return (
    <div className="space-y-5">

      {/* ── Header band ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <nav className="flex items-center text-sm text-primary-300 mb-3" aria-label="Fil d'Ariane">
          <a href="/school" className="hover:text-white transition-colors">Administration</a>
          <span className="mx-2 text-primary-600" aria-hidden="true">/</span>
          <a href="/school/announcements" className="hover:text-white transition-colors">Annonces</a>
          <span className="mx-2 text-primary-600" aria-hidden="true">/</span>
          <span className="text-white font-medium">Nouvelle annonce</span>
        </nav>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Rédiger une annonce
        </h1>
        <p className="text-primary-300 text-sm mt-0.5">{school.name}</p>
      </div>

      {/* ── Form card ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <AnnouncementForm classes={classes} />
      </div>

    </div>
  )
}
