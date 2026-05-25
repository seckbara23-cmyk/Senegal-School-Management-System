import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ParentForm } from './_form'

export default async function NewParentPage() {
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

  const school = (memberships[0].schools as unknown as { id: string; name: string })

  return (
    <div className="space-y-5">

      {/* ── Header band ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <nav className="flex items-center text-sm text-primary-300 mb-3" aria-label="Fil d'Ariane">
          <a href="/school" className="hover:text-white transition-colors">Administration</a>
          <span className="mx-2 text-primary-600" aria-hidden="true">/</span>
          <a href="/school/parents" className="hover:text-white transition-colors">Parents &amp; Tuteurs</a>
          <span className="mx-2 text-primary-600" aria-hidden="true">/</span>
          <span className="text-white font-medium">Nouveau dossier</span>
        </nav>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Nouveau dossier parent / tuteur
        </h1>
        <p className="text-primary-300 text-sm mt-0.5">{school.name}</p>
      </div>

      {/* ── Form card ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-primary-600 mb-1">
          Informations du responsable
        </p>
        <p className="text-sm text-gray-500 mb-5">
          Renseignez les coordonnées du parent ou tuteur légal. Vous pourrez lier des élèves depuis la fiche une fois le dossier créé.
        </p>
        <ParentForm />
      </div>

    </div>
  )
}
