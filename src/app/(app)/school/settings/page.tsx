import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SchoolProfileForm } from './_form'

type Props = { searchParams: { saved?: string; setup?: string } }

export default async function SchoolSettingsPage({ searchParams }: Props) {
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

  const { data } = await supabase
    .from('schools').select('name, phone, email, address').eq('id', schoolId).maybeSingle()
  const school = (data as { name: string; phone: string | null; email: string | null; address: string | null } | null)
    ?? { name: '', phone: null, email: null, address: null }

  const fromSetup = searchParams.setup === '1'
  const cancelHref = fromSetup ? '/school/setup' : '/school'

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href={cancelHref} className="text-primary-300 hover:text-white text-sm">
            ← {fromSetup ? 'Configuration' : 'Tableau de bord'}
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Profil de l&apos;école</h1>
        <p className="text-primary-300 text-sm mt-0.5">Coordonnées de votre établissement</p>
      </div>

      {searchParams.saved === '1' && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Profil de l&apos;école mis à jour.
        </div>
      )}

      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <SchoolProfileForm defaults={school} cancelHref={cancelHref} />
        <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-400">
          L&apos;identifiant, l&apos;abonnement et le statut de l&apos;établissement sont gérés par l&apos;administrateur de la plateforme.
        </p>
      </div>
    </div>
  )
}
