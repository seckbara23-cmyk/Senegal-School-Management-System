import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { csvResponse, fileToken } from '@/lib/csv'
import { buildInvoicesCsv } from '@/lib/finance-export'
import { resolveFinanceSchool } from '../_shared'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const ctx = await resolveFinanceSchool(supabase)
  if ('error' in ctx) return new NextResponse(ctx.error, { status: ctx.status })

  const sp = request.nextUrl.searchParams
  const ay = sp.get('academic_year_id')
  const csv = await buildInvoicesCsv(supabase, ctx.schoolId, {
    status:         sp.get('status'),
    q:              sp.get('q') ?? '',
    academicYearId: ay && /^[0-9a-fA-F-]{36}$/.test(ay) ? ay : null,
  })

  const date = new Date().toISOString().slice(0, 10)
  return csvResponse(`factures_${fileToken(ctx.slug)}_${date}.csv`, csv)
}
