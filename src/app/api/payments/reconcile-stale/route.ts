import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { reconcilePaymentRequest } from '@/lib/payments/service'

// Backstop for missed webhooks: re-verify payment_requests stuck in 'processing'.
// Schedule via a cron (e.g. Vercel cron GET with `Authorization: Bearer
// $CRON_SECRET`, or any scheduler POSTing `x-cron-secret`). Idempotent — reconcile
// records at most once; perpetually-pending requests are bounded by the 7-day floor.
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  const provided = req.headers.get('x-cron-secret')
    ?? (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    ?? url.searchParams.get('secret')
  if (!secret || provided !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()        // stuck > 10 min
  const floor = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // give up after 7 days

  const { data } = await admin.from('payment_requests').select('id')
    .eq('status', 'processing').lt('updated_at', cutoff).gte('created_at', floor).limit(100)
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id)

  const result = { checked: ids.length, paid: 0, failed: 0, processing: 0 }
  for (const id of ids) {
    const r = await reconcilePaymentRequest(id)
    if (r.status === 'paid') result.paid++
    else if (r.status === 'failed') result.failed++
    else result.processing++
  }
  return NextResponse.json({ ok: true, ...result })
}

export async function POST(req: Request) { return handle(req) }
export async function GET(req: Request) { return handle(req) }
