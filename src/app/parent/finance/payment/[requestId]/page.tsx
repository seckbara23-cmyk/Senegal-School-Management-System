import { requireParentCtx } from '../../../_auth'
import { notFound } from 'next/navigation'
import { reconcilePaymentRequest } from '@/lib/payments/service'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA' }

type Props = { params: { requestId: string }; searchParams: { cancelled?: string } }

export default async function PaymentReturnPage({ params, searchParams }: Props) {
  const { supabase } = await requireParentCtx()

  // RLS: a parent only sees requests for their linked children.
  const { data: reqRaw } = await supabase
    .from('payment_requests').select('id, status, amount, invoice_id, payment_id, provider').eq('id', params.requestId).maybeSingle()
  const req = reqRaw as { id: string; status: string; amount: number; invoice_id: string; payment_id: string | null; provider: string } | null
  if (!req) notFound()

  // Fallback reconciliation: if the webhook hasn't landed yet, poll the provider.
  let status = req.status
  let paymentId = req.payment_id
  if (!searchParams.cancelled && (status === 'pending' || status === 'processing')) {
    const result = await reconcilePaymentRequest(req.id)
    status = result.status
    paymentId = result.paymentId ?? paymentId
  }
  if (searchParams.cancelled && status === 'processing') status = 'cancelled'

  const paid = status === 'paid'
  const failed = status === 'failed' || status === 'expired'
  const cancelled = status === 'cancelled' || !!searchParams.cancelled
  const pending = !paid && !failed && !cancelled

  return (
    <div className="space-y-5 pb-8">
      <div className={`rounded-xl p-6 text-center shadow-sm ${paid ? 'border border-emerald-200 bg-emerald-50' : failed ? 'border border-red-200 bg-red-50' : 'border border-sand-200 bg-white'}`}>
        <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-2xl text-white ${paid ? 'bg-emerald-500' : failed ? 'bg-red-500' : 'bg-amber-500'}`}>
          {paid ? '✓' : failed ? '✕' : '…'}
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          {paid ? 'Paiement confirmé' : failed ? 'Paiement échoué' : cancelled ? 'Paiement annulé' : 'Paiement en cours de vérification'}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {paid ? `Votre paiement de ${fmt(req.amount)} a bien été reçu.`
            : failed ? 'Le paiement n’a pas abouti. Aucun montant n’a été débité côté école.'
            : cancelled ? 'Vous avez annulé le paiement. Vous pouvez réessayer.'
            : 'Si vous avez réglé, la confirmation peut prendre quelques instants. Actualisez cette page.'}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {paid && paymentId && <a href={`/parent/finance/payments/${paymentId}`} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">Voir le reçu</a>}
        {pending && <a href={`/parent/finance/payment/${req.id}`} className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-sand-50">Actualiser</a>}
        <a href={`/parent/finance/invoices/${req.invoice_id}`} className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-sand-50">Retour à la facture</a>
      </div>
    </div>
  )
}
