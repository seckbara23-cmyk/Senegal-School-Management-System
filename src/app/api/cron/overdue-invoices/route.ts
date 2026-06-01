import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyOverdueInvoices } from '@/lib/notification-jobs'

// Cron endpoint for the overdue-invoice notification job (Phase 36.5).
//
// Security: requires `Authorization: Bearer ${CRON_SECRET}`. Vercel Cron sends
// this header automatically when CRON_SECRET is set in the project env. Any
// request missing/with a wrong token — including browser/session access — gets
// 401. The route fails CLOSED: if CRON_SECRET is not configured, every request
// is rejected. The service-role client is created server-side only; the secret
// and the key never reach the client.
//
// Vercel Cron invokes the path with GET, so only GET is handled.

export const dynamic = 'force-dynamic'   // never cache; always run fresh
export const runtime = 'nodejs'          // needs the service-role key
export const maxDuration = 60            // allow the cross-tenant scan to finish

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  // Fail closed: reject if the secret is unset or the bearer token doesn't match.
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const admin = createAdminClient()
  const summary = await notifyOverdueInvoices(admin)
  const finishedAt = new Date().toISOString()

  return NextResponse.json({ ...summary, startedAt, finishedAt })
}
