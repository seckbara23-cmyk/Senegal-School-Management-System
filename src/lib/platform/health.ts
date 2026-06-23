// ─── School health scoring (pure, derived, never persisted) ──────────────────
//
// Composite 0–100 from cheap cross-school signals. Recomputed on every read.

export type HealthBand = 'healthy' | 'watch' | 'risk' | 'dormant' | 'suspended'

export type HealthInputs = {
  subscriptionStatus: string          // schools.subscription_status (access)
  billingStatus: string | null        // school_subscriptions.status
  daysSinceActivity: number | null    // from audit_logs (null = never)
  collectionRate: number | null       // 0–100, null = no invoices yet
  activeStudents: number
}

export type SchoolHealth = { score: number; band: HealthBand; reasons: string[] }

export const HEALTH_BAND_LABEL: Record<HealthBand, string> = {
  healthy: 'Saine', watch: 'À surveiller', risk: 'À risque', dormant: 'Dormante', suspended: 'Suspendue',
}
export const HEALTH_BAND_CLASS: Record<HealthBand, string> = {
  healthy:   'border-emerald-200 bg-emerald-50 text-emerald-700',
  watch:     'border-amber-200 bg-amber-50 text-amber-700',
  risk:      'border-orange-200 bg-orange-50 text-orange-700',
  dormant:   'border-red-200 bg-red-50 text-red-700',
  suspended: 'border-gray-200 bg-gray-100 text-gray-500',
}

export function computeHealth(i: HealthInputs): SchoolHealth {
  if (i.subscriptionStatus === 'suspended' || i.subscriptionStatus === 'archived') {
    return { score: 0, band: 'suspended', reasons: [`Accès ${i.subscriptionStatus === 'archived' ? 'archivé' : 'suspendu'}`] }
  }

  const reasons: string[] = []
  let score = 0

  // Activity recency (40).
  const d = i.daysSinceActivity
  if (d === null) { score += 0; reasons.push('Aucune activité enregistrée') }
  else if (d <= 3) score += 40
  else if (d <= 7) score += 32
  else if (d <= 14) { score += 22; reasons.push('Activité ralentie (>1 semaine)') }
  else if (d <= 30) { score += 12; reasons.push('Faible activité (>2 semaines)') }
  else if (d <= 45) { score += 5; reasons.push('Activité très faible (>1 mois)') }
  else reasons.push('Inactive depuis plus de 45 jours')

  // Data / activation (20).
  if (i.activeStudents > 0) score += 20
  else reasons.push('Aucun élève actif')

  // Collection (25).
  if (i.collectionRate === null) score += 12
  else { score += Math.round((i.collectionRate / 100) * 25); if (i.collectionRate < 50) reasons.push(`Recouvrement faible (${i.collectionRate}%)`) }

  // Billing (15).
  if (i.subscriptionStatus === 'active') score += 15
  else score += 8
  if (i.billingStatus === 'past_due') { score = Math.max(0, score - 8); reasons.push('Facturation en retard') }

  score = Math.max(0, Math.min(100, score))
  const band: HealthBand = score >= 70 ? 'healthy' : score >= 45 ? 'watch' : score >= 20 ? 'risk' : 'dormant'
  return { score, band, reasons }
}
