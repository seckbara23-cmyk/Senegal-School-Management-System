import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { EditSchoolForm, type SchoolFormValues } from './_form'

export default async function EditSchoolPage({ params }: { params: { schoolId: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('global_role').eq('id', user.id).maybeSingle()
  if ((profile as { global_role: string } | null)?.global_role !== 'super_admin') redirect('/dashboard')

  const { data: schoolData } = await supabase
    .from('schools')
    .select('id, name, slug, address, phone, email, subscription_plan, trial_ends_at')
    .eq('id', params.schoolId)
    .maybeSingle()

  if (!schoolData) notFound()
  const school = schoolData as SchoolFormValues

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav className="text-sm text-gray-500">
        <Link href="/super-admin" className="hover:text-indigo-600 hover:underline">Super Admin</Link>
        <span className="mx-2">/</span>
        <Link href="/super-admin/schools" className="hover:text-indigo-600 hover:underline">Écoles</Link>
        <span className="mx-2">/</span>
        <Link href={`/super-admin/schools/${school.id}`} className="hover:text-indigo-600 hover:underline">{school.name}</Link>
        <span className="mx-2">/</span>
        <span className="font-medium text-gray-900">Modifier</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Modifier l&apos;école</h1>
        <p className="mt-0.5 text-sm text-gray-500">Profil de l&apos;établissement et formule d&apos;abonnement.</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <EditSchoolForm school={school} />
      </div>
    </div>
  )
}
