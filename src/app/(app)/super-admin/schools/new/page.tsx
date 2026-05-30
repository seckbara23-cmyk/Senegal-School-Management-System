import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { NewSchoolForm } from './_form'

export default async function NewSchoolPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('global_role').eq('id', user.id).maybeSingle()
  if ((profile as { global_role: string } | null)?.global_role !== 'super_admin') redirect('/dashboard')

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav className="text-sm text-gray-500">
        <Link href="/super-admin" className="hover:text-indigo-600 hover:underline">Super Admin</Link>
        <span className="mx-2">/</span>
        <Link href="/super-admin/schools" className="hover:text-indigo-600 hover:underline">Écoles</Link>
        <span className="mx-2">/</span>
        <span className="font-medium text-gray-900">Nouvelle école</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Créer une école</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Provisionnez un nouvel établissement et son premier compte administrateur en une étape.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <NewSchoolForm />
      </div>
    </div>
  )
}
