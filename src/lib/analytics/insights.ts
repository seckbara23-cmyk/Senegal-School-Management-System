// ─── Predictive insights (derived, never persisted) ──────────────────────────
//
// A school-wide early-warning view built entirely on the existing risk engine
// (loadSchoolRisk). No scores are stored; everything is recomputed on read. Adds
// factor-prevalence counts (how many at-risk students show each signal) on top of
// the per-student watchlist.

import type { createClient as createServerClient } from '@/lib/supabase/server'
import { loadSchoolRisk, type StudentRisk } from '@/lib/academic/risk-data'

type Client = ReturnType<typeof createServerClient>

export type Insights = {
  summary: { total: number; high: number; medium: number }
  watch: StudentRisk[]
  factors: { academic: number; attendance: number; finance: number }
}

export async function loadInsights(client: Client, schoolId: string): Promise<Insights> {
  const risk = await loadSchoolRisk(client, schoolId)
  const watch = risk.results.filter((r) => r.level !== 'low')

  const factors = { academic: 0, attendance: 0, finance: 0 }
  for (const r of watch) {
    if (r.reasons.some((x) => /moyenne|échec|baisse|classement/i.test(x))) factors.academic++
    if (r.reasons.some((x) => /absence|retard/i.test(x))) factors.attendance++
    if (r.reasons.some((x) => /solde|facture/i.test(x))) factors.finance++
  }

  return { summary: risk.summary, watch, factors }
}
