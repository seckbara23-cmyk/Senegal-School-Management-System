'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { reconcilePaymentRequest } from '@/lib/payments/service'

export async function reverifyPayment(formData: FormData): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: m } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!m) redirect('/school')
  const schoolId = (m as { school_id: string }).school_id

  const id = z.string().uuid().safeParse(formData.get('request_id'))
  if (!id.success) redirect('/school/finance/online-payments')

  // Ownership: the request must belong to this school (RLS-scoped read).
  const { data: req } = await supabase.from('payment_requests').select('id').eq('id', id.data).eq('school_id', schoolId).maybeSingle()
  if (!req) redirect('/school/finance/online-payments')

  await reconcilePaymentRequest(id.data)
  redirect('/school/finance/online-payments?reverified=1')
}
