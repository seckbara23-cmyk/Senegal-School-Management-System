import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { csvResponse, fileToken } from '@/lib/csv'
import { buildReportCsv } from '@/lib/finance-export'
import { resolveFinanceSchool, validDate, defaultMonthRange } from '../_shared'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const ctx = await resolveFinanceSchool(supabase)
  if ('error' in ctx) return new NextResponse(ctx.error, { status: ctx.status })

  const sp = request.nextUrl.searchParams
  const def = defaultMonthRange()
  const dateFrom = validDate(sp.get('date_from')) ?? def.from
  const dateTo   = validDate(sp.get('date_to'))   ?? def.to

  const csv = await buildReportCsv(supabase, ctx.schoolId, { dateFrom, dateTo })

  const date = new Date().toISOString().slice(0, 10)
  return csvResponse(`rapport-finance_${fileToken(ctx.slug)}_${date}.csv`, csv)
}
