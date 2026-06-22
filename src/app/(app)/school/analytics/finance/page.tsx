import { requireAnalyticsCtx } from '../_auth'
import { loadFinanceAnalytics } from '@/lib/analytics/finance'
import { KpiCard, HBar, BarChart, ProgressRing, Panel } from '@/components/charts'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA' }
function fmtK(n: number) { return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n) }

export default async function FinanceAnalyticsPage() {
  const { supabase, schoolId } = await requireAnalyticsCtx()
  const a = await loadFinanceAnalytics(supabase, schoolId)
  const methodTotal = a.methodMix.reduce((s, m) => s + m.amount, 0)
  const revTotal = Math.max(1, a.tuitionRevenue + a.transportRevenue)

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/analytics" className="text-primary-300 hover:text-white text-sm">← Analyses</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Analyse financière</h1>
        <p className="text-primary-300 text-sm mt-0.5">Recouvrement, tendance et débiteurs</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Facturé" value={fmt(a.invoiced)} tone="primary" />
        <KpiCard label="Encaissé" value={fmt(a.collected)} tone="emerald" />
        <KpiCard label="Solde dû" value={fmt(a.outstanding)} href="/school/finance/invoices?status=overdue" tone={a.outstanding > 0 ? 'red' : 'emerald'} />
        <KpiCard label="Échéanciers" value={a.activePlans} sub={`${a.planAdoption}% des factures`} tone="gray" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Taux de recouvrement">
          <div className="flex items-center justify-center py-2">
            <ProgressRing value={a.collectionRate} label="encaissé" className={a.collectionRate >= 70 ? 'text-emerald-500' : 'text-amber-500'} size={120} />
          </div>
        </Panel>

        <Panel title="Encaissements (6 mois)">
          <BarChart data={a.monthly.map((m) => ({ label: m.label, value: m.amount, display: m.amount > 0 ? fmtK(m.amount) : '' }))} barClass="bg-emerald-500" />
        </Panel>

        <Panel title="Revenus par origine">
          <div className="space-y-3">
            <HBar label="Scolarité & frais" value={a.tuitionRevenue} max={revTotal} display={fmt(a.tuitionRevenue)} barClass="bg-primary-500" />
            <HBar label="Transport" value={a.transportRevenue} max={revTotal} display={fmt(a.transportRevenue)} barClass="bg-sky-500" />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Ancienneté des impayés">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm"><span className="text-gray-600">0–30 jours</span><span className="font-semibold text-amber-600">{fmt(a.aging.b1)}</span></div>
            <div className="flex items-center justify-between text-sm"><span className="text-gray-600">31–60 jours</span><span className="font-semibold text-orange-600">{fmt(a.aging.b2)}</span></div>
            <div className="flex items-center justify-between text-sm"><span className="text-gray-600">61 jours et +</span><span className="font-semibold text-red-600">{fmt(a.aging.b3)}</span></div>
          </div>
        </Panel>

        <Panel title="Encaissements par mode">
          {a.methodMix.length === 0 ? <p className="text-sm text-gray-400">Aucun paiement.</p> : (
            <div className="space-y-3">
              {a.methodMix.map((m) => <HBar key={m.label} label={m.label} value={m.amount} max={methodTotal} display={fmt(m.amount)} barClass="bg-primary-500" />)}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Principaux débiteurs" action={<a href="/school/finance/families" className="text-xs text-primary-600 hover:underline">Vue familles →</a>}>
        {a.topDebtors.length === 0 ? <p className="text-sm text-gray-400">Aucun solde impayé. 🎉</p> : (
          <ul className="divide-y divide-sand-100">
            {a.topDebtors.map((d, i) => (
              <li key={d.studentId} className="flex items-center justify-between gap-3 py-2">
                <a href={`/school/students/${d.studentId}`} className="min-w-0 text-sm font-medium text-gray-900 hover:text-primary-600 hover:underline"><span className="mr-2 text-gray-400">{i + 1}.</span>{d.name}</a>
                <span className="shrink-0 text-sm font-bold text-red-600">{fmt(d.balance)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
