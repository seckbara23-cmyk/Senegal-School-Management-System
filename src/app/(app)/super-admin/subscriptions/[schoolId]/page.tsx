import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { EditSubscriptionForm, type SubscriptionFormValues } from './_form'
import { CreateInvoiceForm } from './_create_invoice_form'
import { cancelSubscription } from '../actions'

const INV_STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon', issued: 'Émise', paid: 'Réglée', overdue: 'En retard', cancelled: 'Annulée',
}
const INV_STATUS_BADGE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600 border-gray-200',
  issued:    'bg-sky-50 text-sky-700 border-sky-200',
  paid:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  overdue:   'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
}
function fmtMoney(n: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR').format(Number(n)) + ' ' + currency
}

const SUB_STATUS_LABEL: Record<string, string> = {
  trialing: 'Essai', active: 'Active', past_due: 'Impayé', suspended: 'Suspendu', cancelled: 'Annulé',
}
const ACCESS_LABEL: Record<string, string> = {
  active: 'Actif', inactive: 'Inactif', suspended: 'Suspendu', archived: 'Archivé',
}
const OK_MSG: Record<string, string> = {
  updated:   'Abonnement enregistré.',
  cancelled: 'Abonnement annulé.',
}
const ERR_MSG: Record<string, string> = {
  module:   "Le module d'abonnements n'est pas initialisé (migration 039).",
  notfound: 'Abonnement introuvable pour cette école.',
  already:  'Cet abonnement est déjà annulé.',
  server:   'Une erreur est survenue. Veuillez réessayer.',
}

function toDateInput(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : ''
}
function limit(n: number | null): string {
  return n === null || n === undefined ? 'illimité' : String(n)
}

type Props = { params: { schoolId: string }; searchParams: { ok?: string; error?: string } }

export default async function SubscriptionDetailPage({ params, searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('global_role').eq('id', user.id).maybeSingle()
  if ((profile as { global_role: string } | null)?.global_role !== 'super_admin') redirect('/dashboard')

  // School must exist (also gives us the access lifecycle status + name).
  const { data: schoolRaw } = await supabase
    .from('schools').select('id, name, subscription_status').eq('id', params.schoolId).maybeSingle()
  if (!schoolRaw) notFound()
  const school = schoolRaw as { id: string; name: string; subscription_status: string }

  // Current subscription, joined with its plan.
  const { data: subRaw, error: subErr } = await supabase
    .from('school_subscriptions')
    .select(
      'id, plan_id, status, trial_ends_at, current_period_start, current_period_end, cancelled_at, ' +
      'subscription_plans!inner(code, name, monthly_price, max_students, max_teachers, max_storage_mb)'
    )
    .eq('school_id', params.schoolId)
    .maybeSingle()

  // Plan catalogue for the select.
  const { data: plansData } = await supabase
    .from('subscription_plans').select('id, name, is_active').order('monthly_price', { ascending: true })
  const plans = (plansData ?? []) as { id: string; name: string; is_active: boolean }[]

  // Counts for this school.
  const [{ count: studentCount }, { count: teacherCount }] = await Promise.all([
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', params.schoolId).eq('status', 'active'),
    supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', params.schoolId).eq('status', 'active'),
  ])

  const okText  = searchParams.ok ? OK_MSG[searchParams.ok] : null
  const errText = searchParams.error ? (ERR_MSG[searchParams.error] ?? ERR_MSG.server) : null

  // Module missing or no subscription row for this school.
  if (subErr || !subRaw) {
    return (
      <div className="space-y-6">
        <Header name={school.name} />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-800">Aucun abonnement</p>
          <p className="mt-1 text-sm text-amber-700">
            {subErr
              ? "Les tables d'abonnement ne sont pas accessibles (migration 039 non exécutée ?)."
              : "Cette école n'a pas encore d'abonnement enregistré."}
          </p>
        </div>
      </div>
    )
  }

  type SubRow = {
    id: string; plan_id: string; status: string
    trial_ends_at: string | null; current_period_start: string | null
    current_period_end: string | null; cancelled_at: string | null
    subscription_plans: { code: string; name: string; monthly_price: number | null; max_students: number | null; max_teachers: number | null; max_storage_mb: number | null } | null
  }
  const sub = subRaw as unknown as SubRow

  // This school's SaaS invoices (most recent first).
  const { data: invData } = await supabase
    .from('subscription_invoices')
    .select('id, invoice_number, amount, amount_paid, currency, status, due_date')
    .eq('school_id', school.id)
    .order('created_at', { ascending: false })
    .limit(50)
  type InvRow = { id: string; invoice_number: string; amount: number; amount_paid: number; currency: string; status: string; due_date: string | null }
  const invoices = (invData ?? []) as InvRow[]

  const values: SubscriptionFormValues = {
    school_id:            school.id,
    plan_id:              sub.plan_id,
    status:               sub.status,
    trial_ends_at:        toDateInput(sub.trial_ends_at),
    current_period_start: toDateInput(sub.current_period_start),
    current_period_end:   toDateInput(sub.current_period_end),
  }

  return (
    <div className="space-y-6">
      <Header name={school.name} />

      {okText && (
        <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{okText}</div>
      )}
      {errText && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errText}</div>
      )}

      {/* Billing vs access separation */}
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
        <p className="text-sm text-sky-800">
          <span className="font-semibold">Facturation ≠ accès.</span> Le statut d&apos;abonnement ci-dessous
          est indépendant de l&apos;accès de l&apos;école. Accès actuel :{' '}
          <span className="font-semibold">{ACCESS_LABEL[school.subscription_status] ?? school.subscription_status}</span>.
          Pour suspendre ou archiver l&apos;accès, utilisez la{' '}
          <Link href={`/super-admin/schools/${school.id}`} className="font-medium underline hover:text-sky-900">fiche de l&apos;école</Link>.
        </p>
      </div>

      {/* Plan limits vs usage */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Formule</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{sub.subscription_plans?.name ?? '—'}</p>
          <p className="text-xs text-gray-400">Statut : {SUB_STATUS_LABEL[sub.status] ?? sub.status}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Élèves actifs</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{studentCount ?? 0} / {limit(sub.subscription_plans?.max_students ?? null)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Enseignants actifs</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{teacherCount ?? 0} / {limit(sub.subscription_plans?.max_teachers ?? null)}</p>
        </div>
      </div>

      {/* Edit form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Modifier l&apos;abonnement</h2>
        <EditSubscriptionForm values={values} plans={plans} />
      </div>

      {/* SaaS billing ledger */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Facturation de l&apos;abonnement</h2>
          <Link href="/super-admin/subscriptions/invoices" className="text-xs font-medium text-indigo-600 hover:text-indigo-900 hover:underline">Toutes les factures →</Link>
        </div>

        {invoices.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune facture d&apos;abonnement pour cette école.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left">
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">N°</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Montant</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Réglé</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Statut</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((iv, idx) => (
                    <tr key={iv.id} className={`border-b border-gray-100 ${idx % 2 ? 'bg-gray-50/40' : 'bg-white'}`}>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                        <Link href={`/super-admin/subscriptions/invoices/${iv.id}`} className="hover:text-indigo-700 hover:underline">{iv.invoice_number}</Link>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-800 whitespace-nowrap">{fmtMoney(iv.amount, iv.currency)}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-700 whitespace-nowrap">{fmtMoney(iv.amount_paid, iv.currency)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${INV_STATUS_BADGE[iv.status] ?? INV_STATUS_BADGE.draft}`}>
                          {INV_STATUS_LABEL[iv.status] ?? iv.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link href={`/super-admin/subscriptions/invoices/${iv.id}`} className="text-xs font-medium text-indigo-600 hover:text-indigo-900 hover:underline">Voir →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-5 border-t border-gray-100 pt-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Nouvelle facture</h3>
          <CreateInvoiceForm schoolId={school.id} suggestedAmount={sub.subscription_plans?.monthly_price ?? null} />
        </div>
      </div>

      {/* Cancel (danger) */}
      {sub.status !== 'cancelled' && (
        <div className="rounded-xl border border-red-100 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">Annuler l&apos;abonnement</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Passe le statut de facturation à « Annulé ». N&apos;affecte pas l&apos;accès de l&apos;école.
              </p>
            </div>
            <form action={cancelSubscription}>
              <input type="hidden" name="school_id" value={school.id} />
              <button type="submit" className="shrink-0 rounded-md border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
                Annuler l&apos;abonnement
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Header({ name }: { name: string }) {
  return (
    <div>
      <nav className="mb-1 text-sm text-gray-500">
        <Link href="/super-admin" className="hover:text-indigo-600 hover:underline">Super Admin</Link>
        <span className="mx-2">/</span>
        <Link href="/super-admin/subscriptions" className="hover:text-indigo-600 hover:underline">Abonnements</Link>
        <span className="mx-2">/</span>
        <span className="font-medium text-gray-900">{name}</span>
      </nav>
      <h1 className="text-2xl font-bold text-gray-900">{name}</h1>
      <p className="mt-0.5 text-sm text-gray-500">Abonnement &amp; limites de l&apos;établissement.</p>
    </div>
  )
}
