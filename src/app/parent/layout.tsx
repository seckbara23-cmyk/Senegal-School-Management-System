import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ParentNav } from './_nav'

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id, schools!school_id(name)')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/dashboard')

  const schoolName = (membership.schools as unknown as { name: string } | null)?.name ?? ''

  const { data: parent } = await supabase
    .from('parents')
    .select('first_name, last_name')
    .eq('profile_id', user.id)
    .eq('school_id', (membership as unknown as { school_id: string }).school_id)
    .maybeSingle()

  const parentName = parent ? `${parent.first_name} ${parent.last_name}` : ''

  return (
    <div className="flex min-h-screen bg-sand-100">
      <ParentNav
        schoolName={schoolName}
        parentName={parentName}
        userEmail={user.email ?? ''}
      />
      <main className="flex-1 pt-14 lg:pt-0 lg:pl-52">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
