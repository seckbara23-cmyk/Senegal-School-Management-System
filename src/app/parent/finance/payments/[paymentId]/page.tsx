import { notFound } from 'next/navigation'
import { PrintButton } from '@/components/PrintButton'
import { requireParentCtx } from '../../../_auth'

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'Espèces', bank_transfer: 'Virement bancaire', cheque: 'Chèque',
  wave_manual: 'Wave', orange_money_manual: 'Orange Money', other: 'Autre',
}

type Props = { params: { paymentId: string } }

export default async function ParentReceiptPage({ params }: Props) {
  const { supabase, schoolId, parent } = await requireParentCtx()

  // Linked children (parent only ever sees their own).
  const { data: links } = await supabase
    .from('parent_student_links').select('student_id').eq('parent_id', parent.id)
  const childIds = ((links ?? []) as { student_id: string }[]).map((l) => l.student_id)
  if (childIds.length === 0) notFound()

  // The payment must belong to one of the parent's linked children.
  const { data: rawPayment } = await supabase
    .from('student_payments')
    .select(`
      id, receipt_number, amount, payment_method, reference, notes, paid_at, created_at,
      schools!school_id(name, phone, email, address),
      students!student_id(first_name, last_name),
      student_invoices!invoice_id(id, invoice_number, title)
    `)
    .eq('id', params.paymentId)
    .eq('school_id', schoolId)
    .in('student_id', childIds)
    .maybeSingle()
  if (!rawPayment) notFound()

  type PaymentDetail = {
    id: string; receipt_number: string | null; amount: number; payment_method: string
    reference: string | null; notes: string | null; paid_at: string; created_at: string
    schools: { name: string; phone: string | null; email: string | null; address: string | null }
    students: { first_name: string; last_name: string }
    student_invoices: { id: string; invoice_number: string; title: string } | null
  }
  const payment = rawPayment as unknown as PaymentDetail
  const school = payment.schools
  const student = payment.students
  const invoice = payment.student_invoices
  const initials = school.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          * { visibility: hidden; }
          #receipt, #receipt * { visibility: visible; }
          #receipt { position: fixed; inset: 0; width: 100%; padding: 2.5rem; background: white; box-shadow: none; border: none; border-radius: 0; }
          .print-hide { display: none !important; }
        }
      ` }} />

      <div className="space-y-4 print-hide">
        <div className="flex items-center justify-between">
          <a href="/parent/finance" className="text-sm text-primary-600 hover:text-primary-800 hover:underline">← Finances</a>
          <PrintButton />
        </div>
      </div>

      <div id="receipt" className="mt-4 mx-auto max-w-lg rounded-xl border border-sand-200 bg-white shadow-lg overflow-hidden">
        <div className="bg-primary-800 px-6 py-5 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-lg font-bold text-white">{initials}</div>
          <h1 className="text-lg font-bold text-white tracking-wide">{school.name}</h1>
          {(school.phone || school.email) && (
            <p className="text-primary-300 text-xs mt-0.5">{[school.phone, school.email].filter(Boolean).join(' · ')}</p>
          )}
          {school.address && <p className="text-primary-300 text-xs mt-0.5">{school.address}</p>}
        </div>

        <div className="bg-accent-50 border-b border-accent-200 px-6 py-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-700 mb-1">Reçu de Paiement</p>
          <p className="font-mono text-base font-bold text-primary-800">{payment.receipt_number ?? `#${payment.id.slice(0, 8).toUpperCase()}`}</p>
          <p className="text-xs text-gray-500 mt-1">{fmtDate(payment.paid_at)} à {fmtTime(payment.paid_at)}</p>
        </div>

        <div className="px-6 py-5 space-y-0 divide-y divide-sand-100">
          <dl className="grid grid-cols-2 gap-x-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Élève</dt>
            <dd className="text-sm font-semibold text-gray-900 text-right">{student.first_name} {student.last_name}</dd>
          </dl>
          {invoice && (
            <>
              <dl className="grid grid-cols-2 gap-x-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Facture N°</dt>
                <dd className="font-mono text-sm text-gray-700 text-right">{invoice.invoice_number}</dd>
              </dl>
              <dl className="grid grid-cols-2 gap-x-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Objet</dt>
                <dd className="text-sm text-gray-700 text-right">{invoice.title}</dd>
              </dl>
            </>
          )}
          <dl className="grid grid-cols-2 gap-x-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Mode de paiement</dt>
            <dd className="text-sm font-medium text-gray-800 text-right">{METHOD_LABEL[payment.payment_method] ?? payment.payment_method}</dd>
          </dl>
          {payment.reference && (
            <dl className="grid grid-cols-2 gap-x-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Référence</dt>
              <dd className="font-mono text-sm text-gray-700 text-right">{payment.reference}</dd>
            </dl>
          )}
        </div>

        <div className="mx-6 mb-6 rounded-xl bg-primary-600 px-6 py-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-200 mb-1">Montant encaissé</p>
          <p className="text-3xl font-bold text-white">{fmt(payment.amount)}</p>
        </div>

        <div className="border-t border-sand-200 px-6 py-4 text-center">
          <p className="text-xs text-gray-300">Ce reçu est émis par {school.name}</p>
        </div>
      </div>

      <div className="mt-4 mx-auto max-w-lg flex items-center justify-center gap-3 print-hide">
        <PrintButton />
        <a href="/parent/finance" className="rounded-lg border border-sand-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors">Retour</a>
      </div>
    </>
  )
}
