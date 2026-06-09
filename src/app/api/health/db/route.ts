import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// Migration / schema health check (audit C1).
//
// Functional probes that detect whether the manually-applied migrations are
// present in the connected database. Each probe either reads a table that a
// migration created, or calls a function it defined, and reports ok/missing.
// Lets an operator confirm prod == repo before (and after) deploys.
//
// Security: requires `Authorization: Bearer ${CRON_SECRET}` and fails closed,
// exactly like the cron route — it must never be publicly reachable.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ZERO = '00000000-0000-0000-0000-000000000000'

type Check = { name: string; migration: string; ok: boolean; detail?: string }

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const checks: Check[] = []

  // Tables created by manual migrations — service role bypasses RLS, so an error
  // here means the table is genuinely missing.
  const tables: Array<[string, string]> = [
    ['timetable_slots', '030'],
    ['exam_sessions', '032'],
    ['exam_result_publications', '034'],
    ['admission_applications', '035'],
    ['school_documents', '036'],
    ['school_subscriptions', '039'],
    ['subscription_invoices', '040'],
  ]
  for (const [table, migration] of tables) {
    const { error } = await admin.from(table).select('id').limit(1)
    checks.push({ name: `table:${table}`, migration, ok: !error, detail: error?.message })
  }

  // Functions defined by manual migrations. A PGRST202 ("could not find the
  // function") means missing; any other outcome (incl. a business RAISE) proves
  // the function exists.
  const rpcExists = async (name: string, args: Record<string, unknown>, migration: string) => {
    const { error } = await admin.rpc(name, args)
    const missing = error?.code === 'PGRST202' || /could not find the function/i.test(error?.message ?? '')
    checks.push({ name: `function:${name}`, migration, ok: !missing, detail: missing ? error?.message : undefined })
  }
  await rpcExists('check_school_student_limit', { p_school_id: ZERO }, '039')
  await rpcExists('attendance_class_summary', { p_school_id: ZERO, p_year_id: ZERO }, '041')
  await rpcExists('record_student_payment', {
    p_invoice_id: ZERO, p_amount: 1, p_payment_method: 'cash', p_receipt_number: '__healthcheck__',
  }, '042')

  // Migration 038: a missing recursion fix throws 42P17 on any students read
  // under RLS. Probe with an anon client so RLS policies are evaluated.
  try {
    const anon = createSbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const { error } = await anon.from('students').select('id').limit(1)
    const recursion = error?.code === '42P17' || /infinite recursion/i.test(error?.message ?? '')
    checks.push({ name: 'rls:students-no-recursion', migration: '038', ok: !recursion, detail: recursion ? error?.message : undefined })
  } catch (e) {
    checks.push({ name: 'rls:students-no-recursion', migration: '038', ok: false, detail: String(e) })
  }

  const ok = checks.every((c) => c.ok)
  const missing = checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.migration})`)

  return NextResponse.json(
    { ok, missing, checks, note: 'See scripts/verify_migrations.sql for policy/constraint checks (025, 042) not probeable via PostgREST.' },
    { status: ok ? 200 : 503 },
  )
}
