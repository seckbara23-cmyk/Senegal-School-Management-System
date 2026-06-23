'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { logAuditEvent } from '@/lib/audit'

export async function togglePilot(formData: FormData): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('global_role').eq('id', user.id).single()
  if ((profile as { global_role: string } | null)?.global_role !== 'super_admin') redirect('/dashboard')

  const id = z.string().uuid().safeParse(formData.get('school_id'))
  if (!id.success) redirect('/super-admin/pilots')
  const on = formData.get('value') === 'true'

  const admin = createAdminClient()
  await admin.from('schools').update({ is_pilot: on }).eq('id', id.data)
  await logAuditEvent(admin, { actorId: user.id, actorEmail: user.email, schoolId: id.data, action: 'school_pilot_toggled', resourceType: 'school', resourceId: id.data, metadata: { is_pilot: on } })
  redirect('/super-admin/pilots')
}
