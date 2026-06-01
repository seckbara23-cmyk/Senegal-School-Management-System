import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { csvResponse, fileToken } from '@/lib/csv'
import { buildPaymentsCsv } from '@/lib/finance-export'
import { resolveFinanceSchool, validDate } from '../_shared'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const ctx = await resolveFinanceSchool(supabase)
  if ('error' in ctx) return new NextResponse(ctx.error, { status: ctx.status })

  const sp = request.nextUrl.searchParams
  const csv = await buildPaymentsCsv(supabase, ctx.schoolId, {
    dateFrom: validDate(sp.get('date_from')),
    dateTo:   validDate(sp.get('date_to')),
    method:   sp.get('method'),
    q:        sp.get('q') ?? '',
  })

  const date = new Date().toISOString().slice(0, 10)
  return csvResponse(`paiements_${fileToken(ctx.slug)}_${date}.csv`, csv)
}
