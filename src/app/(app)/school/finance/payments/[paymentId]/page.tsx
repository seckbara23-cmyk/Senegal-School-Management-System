import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { PrintButton } from './_print_button'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

const METHOD_LABEL: Record<string, string> = {
  cash:                'Espèces',
  bank_transfer:       'Virement bancaire',
  cheque:              'Chèque',
  wave_manual:         'Wave',
  orange_money_manual: 'Orange Money',
  other:               'Autre',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = {
  params: { paymentId: string }
}

export default async function PaymentReceiptPage({ params }: Props) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) redirect('/school')

  const schoolId = (membership as { school_id: string }).school_id

  // Fetch payment — verify it belongs to this school
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
    .maybeSingle()

  if (!rawPayment) notFound()

  type PaymentDetail = {
    id: string
    receipt_number: string | null
    amount: number
    payment_method: string
    reference: string | null
    notes: string | null
    paid_at: string
    created_at: string
    schools: { name: string; phone: string | null; email: string | null; address: string | null }
    students: { first_name: string; last_name: string }
    student_invoices: { id: string; invoice_number: string; title: string } | null
  }
  const payment = rawPayment as unknown as PaymentDetail

  const school  = payment.schools
  const student = payment.students
  const invoice = payment.student_invoices

  // School initials for print header
  const initials = school.name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return (
    <>
      {/* ── Print CSS ──────────────────────────────────────────────────────── */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          * { visibility: hidden; }
          #receipt, #receipt * { visibility: visible; }
          #receipt {
            position: fixed;
            inset: 0;
            width: 100%;
            padding: 2.5rem;
            background: white;
            box-shadow: none;
            border: none;
            border-radius: 0;
          }
          .print-hide { display: none !important; }
        }
      ` }} />

      <div className="space-y-4 print-hide">
        {/* Back nav — screen only */}
        <div className="flex items-center justify-between print-hide">
          <div className="flex items-center gap-3">
            {invoice && (
              <a
                href={`/school/finance/invoices/${invoice.id}`}
                className="text-sm text-primary-600 hover:text-primary-800 hover:underline"
              >
                ← Retour à la facture
              </a>
            )}
            {!invoice && (
              <a
                href="/school/finance"
                className="text-sm text-primary-600 hover:text-primary-800 hover:underline"
              >
                ← Finances
              </a>
            )}
          </div>
          <PrintButton />
        </div>
      </div>

      {/* ── Receipt card ────────────────────────────────────────────────────── */}
      <div
        id="receipt"
        className="mt-4 mx-auto max-w-lg rounded-xl border border-sand-200 bg-white shadow-lg overflow-hidden"
      >
        {/* School header */}
        <div className="bg-primary-800 px-6 py-5 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-lg font-bold text-white">
            {initials}
          </div>
          <h1 className="text-lg font-bold text-white tracking-wide">{school.name}</h1>
          {(school.phone || school.email) && (
            <p className="text-primary-300 text-xs mt-0.5">
              {[school.phone, school.email].filter(Boolean).join(' · ')}
            </p>
          )}
          {school.address && (
            <p className="text-primary-300 text-xs mt-0.5">{school.address}</p>
          )}
        </div>

        {/* Receipt title + number */}
        <div className="bg-accent-50 border-b border-accent-200 px-6 py-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-700 mb-1">
            Reçu de Paiement
          </p>
          <p className="font-mono text-base font-bold text-primary-800">
            {payment.receipt_number ?? `#${payment.id.slice(0, 8).toUpperCase()}`}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {fmtDate(payment.paid_at)} à {fmtTime(payment.paid_at)}
          </p>
        </div>

        {/* Info rows */}
        <div className="px-6 py-5 space-y-0 divide-y divide-sand-100">
          <dl className="grid grid-cols-2 gap-x-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Élève</dt>
            <dd className="text-sm font-semibold text-gray-900 text-right">
              {student.first_name} {student.last_name}
            </dd>
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
            <dd className="text-sm font-medium text-gray-800 text-right">
              {METHOD_LABEL[payment.payment_method] ?? payment.payment_method}
            </dd>
          </dl>

          {payment.reference && (
            <dl className="grid grid-cols-2 gap-x-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Référence</dt>
              <dd className="font-mono text-sm text-gray-700 text-right">{payment.reference}</dd>
            </dl>
          )}

          {payment.notes && (
            <dl className="grid grid-cols-2 gap-x-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Notes</dt>
              <dd className="text-sm text-gray-600 text-right">{payment.notes}</dd>
            </dl>
          )}
        </div>

        {/* Amount — the centrepiece */}
        <div className="mx-6 mb-6 rounded-xl bg-primary-600 px-6 py-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-200 mb-1">
            Montant encaissé
          </p>
          <p className="text-3xl font-bold text-white">{fmt(payment.amount)}</p>
        </div>

        {/* Footer note */}
        <div className="border-t border-sand-200 px-6 py-4 text-center">
          <p className="text-xs text-gray-400">
            Enregistré le {new Date(payment.created_at).toLocaleDateString('fr-FR', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
          <p className="text-xs text-gray-300 mt-0.5">
            Ce reçu est émis par {school.name}
          </p>
        </div>
      </div>

      {/* ── Action buttons — screen only ──────────────────────────────────── */}
      <div className="mt-4 mx-auto max-w-lg flex flex-wrap items-center justify-center gap-3 print-hide">
        <PrintButton />
        {invoice && (
          <a
            href={`/school/finance/invoices/${invoice.id}`}
            className="rounded-lg border border-sand-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors"
          >
            Voir la facture
          </a>
        )}
        <a
          href="/school/finance/payments/new"
          className="rounded-lg border border-sand-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors"
        >
          Autre paiement
        </a>
      </div>
    </>
  )
}
