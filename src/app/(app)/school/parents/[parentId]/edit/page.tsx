import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { EditParentForm } from './_form'

type Props = {
  params: { parentId: string }
}

export default async function EditParentPage({ params }: Props) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: adminMembership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()

  if (!adminMembership) redirect('/school')
  const schoolId = (adminMembership as { school_id: string }).school_id

  const { data: parentData } = await supabase
    .from('parents')
    .select('id, first_name, last_name, phone, email, address, occupation')
    .eq('id', params.parentId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!parentData) notFound()

  type Parent = {
    id: string
    first_name: string
    last_name: string
    phone: string | null
    email: string | null
    address: string | null
    occupation: string | null
  }
  const parent = parentData as Parent

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href={`/school/parents/${parent.id}`} className="text-primary-300 hover:text-white text-sm">
            ← {parent.last_name} {parent.first_name}
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Modifier le dossier</h1>
        <p className="mt-0.5 text-sm text-primary-300">
          Coordonnées, profession et adresse du responsable
        </p>
      </div>

      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <EditParentForm parent={parent} />
      </div>
    </div>
  )
}
